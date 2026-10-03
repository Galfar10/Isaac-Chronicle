-- Data collection. Only vanilla Repentance / Repentance+ API is required.
-- Every reader is defensive: a failing call returns nil instead of breaking the run.
local json = require("irtc.json")

local C = {}

-- Enum values with numeric fallbacks (values from the official enums).
local function enum(tbl, key, fallback)
  if type(tbl) == "table" and tbl[key] ~= nil then return tbl[key] end
  return fallback
end

local ENTITY_PICKUP = enum(EntityType, "ENTITY_PICKUP", 5)
local PV_COLLECTIBLE = enum(PickupVariant, "PICKUP_COLLECTIBLE", 100)
local PV_TRINKET = enum(PickupVariant, "PICKUP_TRINKET", 350)
local PV_CARD = enum(PickupVariant, "PICKUP_TAROTCARD", 300)
local PV_PILL = enum(PickupVariant, "PICKUP_PILL", 70)
local CURSE_BLIND = enum(LevelCurse, "CURSE_OF_BLIND", 64)
local ITEM_TRINKET = enum(ItemType, "ITEM_TRINKET", 2)
local INTERESTING = { [PV_COLLECTIBLE] = true, [PV_TRINKET] = true, [PV_CARD] = true, [PV_PILL] = true }

local function round(n, digits)
  if type(n) ~= "number" then return nil end
  local m = 10 ^ (digits or 2)
  return math.floor(n * m + 0.5) / m
end

local function try(fn, ...)
  local ok, res = pcall(fn, ...)
  if ok then return res end
  return nil
end

local function popcount(n)
  n = math.tointeger(n) or 0
  local c = 0
  while n > 0 do
    c = c + (n & 1)
    n = n >> 1
  end
  return c
end

function C.player()
  return Isaac.GetPlayer(0)
end

-- Highest collectible id to scan. ItemConfig:GetCollectibles() is documented as
-- partially broken (Get() unusable) but .Size is the common idiom; fall back to the enum.
local maxCollectible
function C.maxCollectibleId()
  if maxCollectible then return maxCollectible end
  local size = try(function() return Isaac.GetItemConfig():GetCollectibles().Size end)
  if type(size) ~= "number" or size <= 1 then
    size = enum(CollectibleType, "NUM_COLLECTIBLES", 733)
  end
  maxCollectible = math.tointeger(size - 1) or 732
  return maxCollectible
end

local vanillaMax = enum(CollectibleType, "NUM_COLLECTIBLES", 733) - 1

function C.hello(version)
  return {
    mod = version,
    proto = 1,
    rgon = REPENTOGON ~= nil,
    rep = REPENTANCE == true,
    maxc = C.maxCollectibleId(),
  }
end

function C.run(continued)
  local game = Game()
  local p = C.player()
  local seeds = try(function() return game:GetSeeds():GetStartSeedString() end)
  return {
    cont = continued and true or false,
    seed = seeds,
    diff = try(function() return game.Difficulty end),
    chal = try(function() return Isaac.GetChallenge() end),
    greed = try(function() return game:IsGreedMode() end),
    ptype = p and try(function() return p:GetPlayerType() end),
    pname = p and try(function() return p:GetName() end),
    f = game:GetFrameCount(),
  }
end

function C.level()
  local game = Game()
  local level = game:GetLevel()
  return {
    stage = try(function() return level:GetStage() end),
    stype = try(function() return level:GetStageType() end),
    abs = try(function() return level:GetAbsoluteStage() end),
    name = try(function() return level:GetName() end),
    curses = try(function() return level:GetCurses() end),
    alt = try(function() return level:IsAltStage() end),
    f = game:GetFrameCount(),
  }
end

function C.room()
  local game = Game()
  local level = game:GetLevel()
  local room = game:GetRoom()
  local desc = level:GetCurrentRoomDesc()
  return {
    idx = try(function() return level:GetCurrentRoomIndex() end),
    grid = desc and desc.GridIndex,
    list = desc and desc.ListIndex,
    type = try(function() return room:GetType() end),
    shape = try(function() return room:GetRoomShape() end),
    variant = desc and desc.Data and desc.Data.Variant,
    visits = desc and desc.VisitedCount,
    clear = try(function() return room:IsClear() end),
    f = game:GetFrameCount(),
  }
end

-- Rooms the player can currently see on the minimap (respects fog/curses: we only
-- report rooms with DisplayFlags > 0 or already visited, never hidden layout).
function C.map()
  local level = Game():GetLevel()
  local rooms = level:GetRooms()
  local out = json.arr()
  local current = level:GetCurrentRoomDesc()
  local currentList = current and current.ListIndex
  for i = 0, rooms.Size - 1 do
    local d = rooms:Get(i)
    if d and d.Data then
      local visited = (d.VisitedCount or 0) > 0
      local display = d.DisplayFlags or 0
      if visited or display > 0 then
        out[#out + 1] = json.arr({
          d.GridIndex,
          d.Data.Type,
          d.Data.Shape,
          visited and 1 or 0,
          d.Clear and 1 or 0,
          display,
          (d.ListIndex == currentList) and 1 or 0,
        })
      end
    end
  end
  return { rooms = out }
end

-- Pickups of interest currently in the room, BEFORE they are collected.
function C.pickups()
  local game = Game()
  local level = game:GetLevel()
  local blindCurse = ((try(function() return level:GetCurses() end) or 0) & CURSE_BLIND) ~= 0
  local config = Isaac.GetItemConfig()
  local items = json.arr()
  local other = {}
  local list = Isaac.FindByType(ENTITY_PICKUP, -1, -1, false, false)
  for _, e in ipairs(list) do
    local v = e.Variant
    if INTERESTING[v] then
      local skip = (v == PV_COLLECTIBLE and e.SubType == 0) -- empty pedestal
      if not skip then
        local pk = e:ToPickup()
        local hidden = false
        if v == PV_COLLECTIBLE then
          if blindCurse then hidden = true end
          -- REPENTOGON exposes EntityPickup:IsBlind() (alt-path "?" items). Vanilla cannot detect those.
          if not hidden and REPENTOGON and pk and pk.IsBlind then
            hidden = try(function() return pk:IsBlind() end) == true
          end
        end
        local entry = {
          k = e.InitSeed,
          v = v,
          s = hidden and -1 or e.SubType,
          x = round(e.Position.X, 0),
          y = round(e.Position.Y, 0),
          p = pk and pk.Price or 0,
          o = pk and pk.OptionsPickupIndex or 0,
        }
        if v == PV_COLLECTIBLE and not hidden then
          local cfg = try(function() return config:GetCollectible(e.SubType) end)
          if cfg then
            entry.q = cfg.Quality
            if e.SubType > vanillaMax then entry.n = cfg.Name end -- modded item: send its name
          end
        elseif v == PV_PILL then
          local pool = game:GetItemPool()
          if try(function() return pool:IsPillIdentified(e.SubType) end) then
            entry.fx = try(function() return pool:GetPillEffect(e.SubType, C.player()) end)
          end
        end
        items[#items + 1] = entry
      end
    else
      other[tostring(v)] = (other[tostring(v)] or 0) + 1
    end
  end
  return { items = items, other = other }
end

function C.position()
  local p = C.player()
  if not p then return nil end
  return { x = round(p.Position.X, 0), y = round(p.Position.Y, 0) }
end

function C.stats()
  local p = C.player()
  if not p then return nil end
  local forms = json.arr()
  for form = 0, 15 do
    if try(function() return p:HasPlayerForm(form) end) then forms[#forms + 1] = form end
  end
  return {
    dmg = round(p.Damage, 2),
    fd = round(p.MaxFireDelay, 2),
    rng = round(p.TearRange, 1),
    ss = round(p.ShotSpeed, 2),
    spd = round(p.MoveSpeed, 2),
    luck = round(p.Luck, 2),
    hp = {
      red = try(function() return p:GetHearts() end),
      max = try(function() return p:GetMaxHearts() end),
      soul = try(function() return p:GetSoulHearts() end),
      black = popcount(try(function() return p:GetBlackHearts() end)),
      bone = try(function() return p:GetBoneHearts() end),
      eternal = try(function() return p:GetEternalHearts() end),
      golden = try(function() return p:GetGoldenHearts() end),
      rotten = try(function() return p:GetRottenHearts() end),
      broken = try(function() return p:GetBrokenHearts() end),
      limit = try(function() return p:GetHeartLimit() end),
    },
    res = {
      coins = try(function() return p:GetNumCoins() end),
      bombs = try(function() return p:GetNumBombs() end),
      keys = try(function() return p:GetNumKeys() end),
      gkey = try(function() return p:HasGoldenKey() end),
      gbomb = try(function() return p:HasGoldenBomb() end),
    },
    forms = forms,
    ptype = try(function() return p:GetPlayerType() end),
  }
end

function C.inventory()
  local p = C.player()
  if not p then return nil end
  local config = Isaac.GetItemConfig()
  local collectibles = json.arr()
  local names = {}
  for id = 1, C.maxCollectibleId() do
    local n = p:GetCollectibleNum(id)
    if n and n > 0 then
      collectibles[#collectibles + 1] = json.arr({ id, n })
      if id > vanillaMax then
        local cfg = try(function() return config:GetCollectible(id) end)
        if cfg then names[tostring(id)] = cfg.Name end
      end
    end
  end
  local actives = json.arr()
  for slot = 0, 3 do
    local id = try(function() return p:GetActiveItem(slot) end) or 0
    if id > 0 then
      actives[#actives + 1] = json.arr({ slot, id, try(function() return p:GetActiveCharge(slot) end) or 0 })
    end
  end
  local trinkets = json.arr()
  for slot = 0, 1 do
    local id = try(function() return p:GetTrinket(slot) end) or 0
    if id > 0 then trinkets[#trinkets + 1] = id end
  end
  local cards = json.arr()
  local pills = json.arr()
  for slot = 0, 3 do
    local card = try(function() return p:GetCard(slot) end) or 0
    if card > 0 then cards[#cards + 1] = card end
    local pill = try(function() return p:GetPill(slot) end) or 0
    if pill > 0 then
      -- Like the game: a pill's effect is only known once that color has been identified
      -- (taken at least once this run, PHD, etc.). Unknown pills are sent without effect.
      local fx = nil
      if try(function() return Game():GetItemPool():IsPillIdentified(pill) end) then
        fx = C.pillEffectOf(pill, p)
      end
      pills[#pills + 1] = json.arr({ pill, fx or -1 })
    end
  end
  return { c = collectibles, a = actives, t = trinkets, k = cards, p = pills, names = names }
end

-- Cheap fingerprint of resources and hearts (checked every frame: coins/bombs/keys
-- and health change without any stat recalculation callback).
function C.resourceSignature()
  local p = C.player()
  if not p then return "" end
  return table.concat({
    try(function() return p:GetNumCoins() end) or 0,
    try(function() return p:GetNumBombs() end) or 0,
    try(function() return p:GetNumKeys() end) or 0,
    try(function() return p:GetHearts() end) or 0,
    try(function() return p:GetMaxHearts() end) or 0,
    try(function() return p:GetSoulHearts() end) or 0,
    try(function() return p:GetBoneHearts() end) or 0,
    try(function() return p:GetGoldenHearts() end) or 0,
    try(function() return p:GetBrokenHearts() end) or 0,
  }, ",")
end

-- Cheap fingerprint of everything that can be dropped/swapped/used from the pocket
-- (~14 API calls). Compared often; the full inventory is sent only when it changes.
function C.pocketSignature()
  local p = C.player()
  if not p then return "" end
  local parts = {}
  for slot = 0, 3 do parts[#parts + 1] = try(function() return p:GetActiveItem(slot) end) or 0 end
  for slot = 0, 1 do parts[#parts + 1] = try(function() return p:GetTrinket(slot) end) or 0 end
  for slot = 0, 3 do
    parts[#parts + 1] = try(function() return p:GetCard(slot) end) or 0
    parts[#parts + 1] = try(function() return p:GetPill(slot) end) or 0
  end
  parts[#parts + 1] = try(function() return p:GetCollectibleCount() end) or 0
  return table.concat(parts, ",")
end

-- Item currently held above the head (picked up, animation not finished yet).
function C.queuedItem()
  local p = C.player()
  if not p then return 0, nil end
  local q = p.QueuedItem
  local item = q and q.Item
  if not item then return 0, nil end
  local kind = (item.Type == ITEM_TRINKET) and "t" or "c"
  return item.ID, { id = item.ID, kind = kind, touched = q.Touched == true }
end

-- True if `player` is the tracked player (player 0).
function C.isMainPlayer(player)
  local main = C.player()
  if not player or not main then return false end
  return GetPtrHash(player) == GetPtrHash(main)
end

-- Effect of a pill color in this run, used ONLY right after that pill was used
-- (to confirm the use), never to reveal unused pills.
function C.pillEffectOf(color, player)
  local pool = Game():GetItemPool()
  local fx = try(function() return pool:GetPillEffect(color, player) end)
  if fx == nil then fx = try(function() return pool:GetPillEffect(color & 2047, player) end) end
  return fx
end

C.round = round
C.popcount = popcount
return C
