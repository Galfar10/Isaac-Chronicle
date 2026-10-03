-- Isaac Real-Time Companion
-- A data bridge: it never draws anything in-game. It reads run data through the
-- vanilla Lua API and writes compact messages to log.txt (Isaac.DebugString).
-- The Companion desktop app tails log.txt and serves the web UI on 127.0.0.1.

local VERSION = "0.1.0"
local mod = RegisterMod("Isaac Real-Time Companion", 1)

local Emitter = require("irtc.emitter")
local C = require("irtc.collect")

-- Update cadence (MC_POST_UPDATE runs 30 times per second).
local PICKUP_EVERY = 3     -- 10 Hz: room pickups diff
local POS_EVERY = 6        -- 5 Hz: player position (only when pickups exist)
local STATS_EVERY = 15     -- 2 Hz safety net (stats on MC_EVALUATE_CACHE, resources every frame)
local INV_EVERY = 30       -- 1 Hz: full inventory diff (safety net)
local POCKET_EVERY = 3     -- 10 Hz: cheap pocket fingerprint (drops, swaps, uses)
local CURSES_EVERY = 10    -- 3 Hz: level curses (map/health visibility)
local HEARTBEAT_MS = 2000  -- real time, also while paused (MC_POST_RENDER)
local POS_THRESHOLD = 8    -- pixels

local state = {
  inRun = false,
  tick = 0,
  lastHeartbeat = 0,
  lastQueued = 0,
  lastPos = nil,
  roomHasPickups = false,
  forceInventory = false,
  -- Set by MC_EVALUATE_CACHE: the game just recalculated damage/tears/range/speed...
  statsDirty = false,
  pocket = "",
  resources = "",
  curses = -1,
  errors = {},
  -- Pocket slot 0 as of the previous update: the pill/card that a real "use" consumes.
  heldCard = 0,
  heldPill = 0,
}

local function reportError(where, err)
  local key = where .. tostring(err)
  if state.errors[key] then return end
  state.errors[key] = true
  pcall(Emitter.send, "err", { where = where, msg = tostring(err) })
end

-- Runs fn protected: a bug in the companion must never break the player's run.
local function safe(where, fn, ...)
  local ok, err = pcall(fn, ...)
  if not ok then reportError(where, err) end
end

local function sendPickups()
  local data = C.pickups()
  state.roomHasPickups = #data.items > 0
  Emitter.sendIfChanged("pickups", data)
end

local function sendPosition(force)
  local pos = C.position()
  if not pos then return end
  local last = state.lastPos
  if not force and last and math.abs(pos.x - last.x) < POS_THRESHOLD and math.abs(pos.y - last.y) < POS_THRESHOLD then
    return
  end
  state.lastPos = pos
  Emitter.send("pos", pos)
end

-- Sends the level and remembers its curses (checked again periodically).
local function sendLevel()
  local data = C.level()
  state.curses = data.curses or 0
  Emitter.send("level", data)
end

local function sendClear()
  Emitter.sendIfChanged("clear", { clear = Game():GetRoom():IsClear() })
end

local function sendFullSnapshot()
  Emitter.forget()
  safe("level", sendLevel)
  safe("room", function() Emitter.send("room", C.room()) end)
  safe("map", function() Emitter.sendIfChanged("map", C.map()) end)
  safe("stats", function() Emitter.sendIfChanged("stats", C.stats()) end)
  safe("inv", function() Emitter.sendIfChanged("inv", C.inventory()) end)
  safe("pos", sendPosition, true)
  safe("pickups", sendPickups)
  safe("clear", sendClear)
end

local function startRun(continued, resync)
  state.inRun = true
  state.tick = 0
  state.lastQueued = 0
  state.lastPos = nil
  Emitter.send("hello", C.hello(VERSION))
  local run = C.run(continued)
  run.resync = resync and true or false
  Emitter.send("run", run)
  sendFullSnapshot()
end

mod:AddCallback(ModCallbacks.MC_POST_GAME_STARTED, function(_, isContinued)
  safe("game_started", startRun, isContinued, false)
end)

mod:AddCallback(ModCallbacks.MC_PRE_GAME_EXIT, function(_, shouldSave)
  safe("game_exit", function()
    Emitter.send("exit", { save = shouldSave and true or false, f = Game():GetFrameCount() })
    state.inRun = false
  end)
end)

mod:AddCallback(ModCallbacks.MC_POST_GAME_END, function(_, isGameOver)
  safe("game_end", function()
    Emitter.send("end", { over = isGameOver and true or false, f = Game():GetFrameCount() })
  end)
end)

mod:AddCallback(ModCallbacks.MC_POST_NEW_LEVEL, function()
  if not state.inRun then return end
  safe("new_level", sendLevel)
end)

mod:AddCallback(ModCallbacks.MC_POST_NEW_ROOM, function()
  if not state.inRun then return end
  safe("room", function() Emitter.send("room", C.room()) end)
  safe("map", function() Emitter.sendIfChanged("map", C.map()) end)
  Emitter.forget("pickups")
  -- Position first: the companion decides proximity reveals with it.
  safe("pos", sendPosition, true)
  safe("pickups", sendPickups)
  safe("clear", sendClear)
end)

mod:AddCallback(ModCallbacks.MC_POST_UPDATE, function()
  -- The mod was (re)loaded mid-run (e.g. "luamod" console command): resynchronise.
  if not state.inRun then
    if C.player() then safe("resync", startRun, true, true) end
    return
  end
  state.tick = state.tick + 1
  local t = state.tick

  -- Pickup detection: the item held above the head is the one being collected.
  safe("queued", function()
    local queuedId, queued = C.queuedItem()
    if queuedId ~= state.lastQueued then
      if queued then Emitter.send("queued", queued) end
      if queuedId == 0 then state.forceInventory = true end
      state.lastQueued = queuedId
    end
  end)

  safe("held", function()
    local p = C.player()
    if p then
      state.heldCard = p:GetCard(0) or 0
      state.heldPill = p:GetPill(0) or 0
    end
  end)

  -- Each reader is isolated: one failing API call never blocks the others.
  if t % PICKUP_EVERY == 0 then safe("pickups", sendPickups) end
  if state.roomHasPickups and t % POS_EVERY == 0 then safe("pos", sendPosition, false) end
  -- Something dropped / picked / swapped / used in the pocket: send the inventory right away.
  if t % POCKET_EVERY == 0 then
    safe("pocket", function()
      local sig = C.pocketSignature()
      if sig ~= state.pocket then
        state.pocket = sig
        state.forceInventory = true
      end
    end)
  end
  if state.statsDirty then state.forceInventory = true end -- items gained/lost recalculate stats
  -- Coins / bombs / keys / hearts: compared every frame (9 cheap calls), sent at once.
  safe("resources", function()
    local sig = C.resourceSignature()
    if sig ~= state.resources then
      state.resources = sig
      state.statsDirty = true
    end
  end)
  if state.statsDirty or t % STATS_EVERY == 0 then
    state.statsDirty = false
    safe("stats", function() Emitter.sendIfChanged("stats", C.stats()) end)
  end
  if state.forceInventory or t % INV_EVERY == 0 then
    state.forceInventory = false
    safe("inv", function() Emitter.sendIfChanged("inv", C.inventory()) end)
  end
  if t % INV_EVERY == 0 then safe("clear", sendClear) end
  -- Curses can change mid-floor (Amnesia pill, Black Candle...): resend the level when they do.
  if t % CURSES_EVERY == 0 then
    safe("curses", function()
      local curses = Game():GetLevel():GetCurses()
      if curses ~= state.curses then
        state.curses = curses
        Emitter.send("level", C.level())
      end
    end)
  end
end)

-- Stats changed (item picked, pill, transformation...): only flag it here, the values are
-- read once on the next MC_POST_UPDATE (the cache callback fires once per stat flag).
mod:AddCallback(ModCallbacks.MC_EVALUATE_CACHE, function()
  state.statsDirty = true
end)

-- Discovery of pills/cards: only a use of what the player is holding counts as evidence.
-- Effects triggered by other items (Echo Chamber, random card effects...) are reported
-- with held=false and never mark anything as discovered.
mod:AddCallback(ModCallbacks.MC_USE_CARD, function(_, card, player, flags)
  if not state.inRun then return end
  safe("use_card", function()
    if not C.isMainPlayer(player) then return end
    local held = card == state.heldCard
    Emitter.send("use", { t = "c", id = card, held = held, flags = flags or 0 })
    state.forceInventory = true
  end)
end)

mod:AddCallback(ModCallbacks.MC_USE_PILL, function(_, effect, player, flags)
  if not state.inRun then return end
  safe("use_pill", function()
    if not C.isMainPlayer(player) then return end
    local color = state.heldPill
    -- Confirm with the game's own color->effect mapping that the effect that just
    -- happened is the one of the pill that was in the player's hand.
    local held = color > 0 and C.pillEffectOf(color, player) == effect
    Emitter.send("use", { t = "p", id = effect, color = color, held = held, flags = flags or 0 })
    state.forceInventory = true
  end)
end)

mod:AddCallback(ModCallbacks.MC_POST_RENDER, function()
  local now = Isaac.GetTime()
  if now - state.lastHeartbeat < HEARTBEAT_MS then return end
  state.lastHeartbeat = now
  safe("heartbeat", function()
    local game = Game()
    Emitter.send("hb", { inRun = state.inRun, paused = game:IsPaused(), f = game:GetFrameCount() })
  end)
end)

-- Announce the mod as soon as it is loaded (before any run).
safe("load", function() Emitter.send("hello", C.hello(VERSION)) end)
