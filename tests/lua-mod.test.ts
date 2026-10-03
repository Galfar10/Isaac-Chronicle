/**
 * Runs the real Lua mod files in a Lua 5.3 VM (fengari) against a stub of the Isaac
 * API, and checks that the produced log lines decode with the TypeScript wire decoder.
 * This validates syntax, the JSON encoder and the wire format — not the game's API
 * itself (that requires running Isaac).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error fengari has no type definitions
import fengari from 'fengari';
import { WireDecoder, type ModMessage } from '@irtc/protocol';
import { GameStateStore } from '../bridge/src/store';

const { lua, lauxlib, lualib, to_luastring } = fengari;
const MOD = join(__dirname, '..', 'isaac-mod');

const STUB = String.raw`
ModCallbacks = { MC_POST_UPDATE = 1, MC_POST_RENDER = 2, MC_USE_CARD = 5, MC_EVALUATE_CACHE = 8, MC_USE_PILL = 10, MC_POST_GAME_STARTED = 15,
  MC_POST_GAME_END = 16, MC_PRE_GAME_EXIT = 17, MC_POST_NEW_LEVEL = 18, MC_POST_NEW_ROOM = 19 }
function GetPtrHash(e) return tostring(e) end
__card0 = 0
__pill0 = 0
__pillMap = {}
EntityType = { ENTITY_PICKUP = 5 }
PickupVariant = { PICKUP_COLLECTIBLE = 100, PICKUP_TRINKET = 350, PICKUP_TAROTCARD = 300, PICKUP_PILL = 70 }
LevelCurse = { CURSE_OF_BLIND = 64 }
ItemType = { ITEM_TRINKET = 2 }
CollectibleType = { NUM_COLLECTIBLES = 733 }
REPENTANCE = true
__lines = {}
__time = 0
__curses = 0
__pickups = {}
local callbacks = {}
function RegisterMod(name, v)
  local m = { Name = name }
  function m:AddCallback(id, fn) callbacks[id] = callbacks[id] or {}; table.insert(callbacks[id], fn) end
  return m
end
function __fire(id, ...) for _, fn in ipairs(callbacks[id] or {}) do fn(nil, ...) end end
local function vec(x, y) return { X = x, Y = y } end
__owned = {}
player = { Damage = 3.5, MaxFireDelay = 10, TearRange = 260, ShotSpeed = 1, MoveSpeed = 1, Luck = 0,
  Position = vec(320, 400), QueuedItem = { Item = nil, Touched = false } }
function player:GetHearts() return 6 end
function player:GetMaxHearts() return 6 end
function player:GetSoulHearts() return 4 end
function player:GetBlackHearts() return 2 end -- bitmask 0b10
function player:GetBoneHearts() return 0 end
function player:GetEternalHearts() return 0 end
function player:GetGoldenHearts() return 0 end
function player:GetRottenHearts() return 0 end
function player:GetBrokenHearts() return 0 end
function player:GetHeartLimit() return 12 end
function player:GetNumCoins() return 5 end
function player:GetNumBombs() return 1 end
function player:GetNumKeys() return 0 end
function player:HasGoldenKey() return false end
function player:HasGoldenBomb() return false end
function player:HasPlayerForm(f) return false end
function player:GetPlayerType() return 0 end
function player:GetName() return "Isaac" end
function player:GetCollectibleNum(id) return __owned[id] or 0 end
function player:GetCollectibleCount() local n = 0 for _, c in pairs(__owned) do n = n + c end return n end
function player:GetActiveItem(slot) return 0 end
function player:GetActiveCharge(slot) return 0 end
function player:GetTrinket(slot) return 0 end
function player:GetCard(slot) if slot == 0 then return __card0 end return 0 end
function player:GetPill(slot) if slot == 0 then return __pill0 end return 0 end
local config = {}
function config:GetCollectibles() return { Size = 733 } end
function config:GetCollectible(id) return { ID = id, Quality = (id == 118) and 4 or 2, Name = "#ITEM_" .. id } end
local roomDesc = { GridIndex = 45, SafeGridIndex = 45, ListIndex = 1, VisitedCount = 1, Data = { Variant = 3, Type = 4, Shape = 1 } }
local level = {}
function level:GetStage() return 1 end
function level:GetStageType() return 0 end
function level:GetAbsoluteStage() return 1 end
function level:GetName() return "Basement I" end
function level:GetCurses() return __curses end
function level:IsAltStage() return false end
function level:GetCurrentRoomIndex() return 45 end
function level:GetCurrentRoomDesc() return roomDesc end
function level:GetRooms()
  local list = { Size = 2 }
  function list:Get(i)
    if i == 0 then return { GridIndex = 58, VisitedCount = 1, Clear = true, DisplayFlags = 5, ListIndex = 0, Data = { Type = 1, Shape = 1 } } end
    return roomDesc
  end
  return list
end
local room = {}
function room:GetType() return 4 end
function room:GetRoomShape() return 1 end
function room:IsClear() return true end
local pool = {}
function pool:IsPillIdentified(c) return false end
function pool:GetPillEffect(c, p) return __pillMap[c] or 0 end
local seeds = {}
function seeds:GetStartSeedString() return "ABCD 1234" end
local frame = 0
local game = { Difficulty = 0 }
function game:GetLevel() return level end
function game:GetRoom() return room end
function game:GetSeeds() return seeds end
function game:GetItemPool() return pool end
function game:IsGreedMode() return false end
function game:IsPaused() return false end
function game:GetFrameCount() frame = frame + 1; return frame end
function Game() return game end
Isaac = {
  DebugString = function(s) table.insert(__lines, "[INFO] - Lua Debug: " .. s) end,
  GetPlayer = function(i) return player end,
  GetTime = function() return __time end,
  GetChallenge = function() return 0 end,
  GetItemConfig = function() return config end,
  FindByType = function(t, v, s) return __pickups end,
}
function __pedestal(seed, id, x, y)
  local e = { InitSeed = seed, Variant = 100, SubType = id, Position = vec(x, y) }
  function e:ToPickup() return { Price = 0, OptionsPickupIndex = 0 } end
  return e
end
function __drain() local out = table.concat(__lines, "\n"); __lines = {}; return out end
`;

function createVM() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code: string, name: string, results = 0) => {
    if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name)) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
    if (lua.lua_pcall(L, 0, results, 0) !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
    if (results) {
      const s = lua.lua_tojsstring(L, -1);
      lua.lua_pop(L, 1);
      return s as string;
    }
    return '';
  };
  run(STUB, '=stub');
  // Preload mod modules so require("irtc.x") works like in the game.
  for (const mod of ['json', 'emitter', 'collect']) {
    const src = readFileSync(join(MOD, 'irtc', `${mod}.lua`), 'utf8');
    lua.lua_getglobal(L, to_luastring('package'));
    lua.lua_getfield(L, -1, to_luastring('preload'));
    if (lauxlib.luaL_loadbuffer(L, to_luastring(src), null, to_luastring(`@irtc/${mod}.lua`)) !== lua.LUA_OK) {
      throw new Error(lua.lua_tojsstring(L, -1));
    }
    lua.lua_setfield(L, -2, to_luastring(`irtc.${mod}`));
    lua.lua_pop(L, 2);
  }
  run(readFileSync(join(MOD, 'main.lua'), 'utf8'), '@main.lua');
  const drain = () => run('return __drain()', '=drain', 1).split('\n').filter(Boolean);
  return { run, drain };
}

function decodeAll(lines: string[], decoder = new WireDecoder()): ModMessage[] {
  return lines.map((l) => {
    const r = decoder.decodeLine(l);
    if (!r || !r.ok) throw new Error(`could not decode: ${l} ${r && !r.ok ? r.reason : ''}`);
    return r.message;
  });
}

describe('Lua mod (executed in a Lua 5.3 VM with a stubbed Isaac API)', () => {
  it('announces itself on load', () => {
    const vm = createVM();
    const msgs = decodeAll(vm.drain());
    expect(msgs.map((m) => m.kind)).toEqual(['hello']);
    expect(msgs[0].data).toMatchObject({ mod: '0.1.0', proto: 1, rgon: false, rep: true, maxc: 732 });
  });

  it('emits a full snapshot on game start that the bridge understands', () => {
    const vm = createVM();
    vm.drain();
    vm.run('__fire(ModCallbacks.MC_POST_GAME_STARTED, false)', '=start');
    const msgs = decodeAll(vm.drain());
    expect(msgs.map((m) => m.kind)).toEqual(['hello', 'run', 'level', 'room', 'map', 'stats', 'inv', 'pos', 'pickups', 'clear']);
    const stats = msgs.find((m) => m.kind === 'stats')!.data as { dmg: number; hp: { black: number; soul: number } };
    expect(stats.dmg).toBe(3.5);
    expect(stats.hp).toMatchObject({ soul: 4, black: 1 });
    const map = msgs.find((m) => m.kind === 'map')!.data as { rooms: number[][] };
    expect(map.rooms).toEqual([
      [58, 1, 1, 1, 1, 5, 0],
      [45, 4, 1, 1, 0, 0, 1],
    ]);
    const store = new GameStateStore();
    for (const m of msgs) store.apply(m);
    expect(store.state.run?.seed).toBe('ABCD 1234');
    expect(store.state.stats?.tears).toBeCloseTo(2.73, 2);
    expect(store.state.room?.type).toBe(4);
  });

  it('detects a pedestal before pickup, then the pickup itself', () => {
    const vm = createVM();
    vm.run('__fire(ModCallbacks.MC_POST_GAME_STARTED, false)', '=start');
    const decoder = new WireDecoder();
    const store = new GameStateStore();
    for (const m of decodeAll(vm.drain(), decoder)) store.apply(m);

    vm.run('__pickups = { __pedestal(777, 118, 320, 300) }; for i = 1, 6 do __fire(ModCallbacks.MC_POST_UPDATE) end', '=spawn');
    const spawnMsgs = decodeAll(vm.drain(), decoder);
    expect(spawnMsgs.map((m) => m.kind)).toContain('pickups');
    for (const m of spawnMsgs) store.apply(m);
    // 2.5 tiles away: detected but not identified.
    expect(store.state.roomItems).toMatchObject([{ key: 777, id: null, kind: 'collectible', unknown: 'far', distance: 2.5 }]);
    expect(store.state.roomItems[0].quality).toBeUndefined();
    expect(store.state.nearestKey).toBe(777);

    // Walk up to the pedestal: the mod reports the position and the item is identified.
    vm.run('player.Position = { X = 320, Y = 330 }; for i = 1, 6 do __fire(ModCallbacks.MC_POST_UPDATE) end', '=walk');
    for (const m of decodeAll(vm.drain(), decoder)) store.apply(m);
    expect(store.state.roomItems).toMatchObject([{ key: 777, id: 118, quality: 4, unknown: null, distance: 0.8 }]);

    vm.run('player.QueuedItem = { Item = { ID = 118, Type = 1 }, Touched = false }; __fire(ModCallbacks.MC_POST_UPDATE)', '=pick');
    vm.run('player.QueuedItem = { Item = nil }; __owned[118] = 1; __pickups = {}; for i = 1, 3 do __fire(ModCallbacks.MC_POST_UPDATE) end', '=done');
    const pickMsgs = decodeAll(vm.drain(), decoder);
    expect(pickMsgs.map((m) => m.kind)).toEqual(expect.arrayContaining(['queued', 'inv', 'pickups']));
    for (const m of pickMsgs) store.apply(m);
    expect(store.state.lastPicked).toMatchObject({ id: 118, kind: 'collectible' });
    expect(store.state.inventory.collectibles.map((c) => c.id)).toEqual([118]);
    expect(store.state.roomItems).toEqual([]);
  });

  it('hides items under Curse of the Blind', () => {
    const vm = createVM();
    vm.run('__curses = 64; __fire(ModCallbacks.MC_POST_GAME_STARTED, false); __pickups = { __pedestal(1, 118, 0, 0) }; for i = 1, 3 do __fire(ModCallbacks.MC_POST_UPDATE) end', '=blind');
    const msgs = decodeAll(vm.drain());
    const last = msgs.filter((m) => m.kind === 'pickups').at(-1)!.data as { items: { s: number; q?: number }[] };
    expect(last.items[0].s).toBe(-1);
    expect(last.items[0].q).toBeUndefined();
  });

  it('sends a heartbeat at most every 2 s and does not resend unchanged data', () => {
    const vm = createVM();
    vm.run('__fire(ModCallbacks.MC_POST_GAME_STARTED, false)', '=start');
    vm.drain();
    vm.run('__time = 5000; __fire(ModCallbacks.MC_POST_RENDER); __time = 5500; __fire(ModCallbacks.MC_POST_RENDER); __time = 7100; __fire(ModCallbacks.MC_POST_RENDER)', '=hb');
    expect(decodeAll(vm.drain()).map((m) => m.kind)).toEqual(['hb', 'hb']);
    vm.run('for i = 1, 60 do __fire(ModCallbacks.MC_POST_UPDATE) end', '=idle');
    // 60 idle updates with nothing changing: no stats/inv/pickups spam.
    expect(decodeAll(vm.drain()).map((m) => m.kind)).toEqual([]);
  });

  it('sends stats on the very next update after the game recalculates them', () => {
    const vm = createVM();
    vm.run('__fire(ModCallbacks.MC_POST_GAME_STARTED, false)', '=start');
    vm.drain();
    // Advance to a tick that is NOT a periodic stats tick (5n), then change damage.
    vm.run('__fire(ModCallbacks.MC_POST_UPDATE)', '=t1');
    vm.drain();
    vm.run('player.Damage = 5.19; __fire(ModCallbacks.MC_EVALUATE_CACHE, player, 1); __fire(ModCallbacks.MC_POST_UPDATE)', '=cache');
    const stats = decodeAll(vm.drain()).filter((m) => m.kind === 'stats');
    expect(stats).toHaveLength(1);
    expect((stats[0].data as { dmg: number }).dmg).toBe(5.19);
    // Health and coins change without a cache evaluation: sent on the very next update.
    vm.run('function player:GetHearts() return 4 end; __fire(ModCallbacks.MC_POST_UPDATE)', '=hp');
    expect(decodeAll(vm.drain()).filter((m) => m.kind === 'stats')).toHaveLength(1);
    vm.run('function player:GetNumCoins() return 6 end; __fire(ModCallbacks.MC_POST_UPDATE)', '=coin');
    const coin = decodeAll(vm.drain()).filter((m) => m.kind === 'stats');
    expect(coin).toHaveLength(1);
    expect((coin[0].data as { res: { coins: number } }).res.coins).toBe(6);
  });

  it('sends the inventory within 3 updates (~100 ms) when something is dropped from the pocket', () => {
    const vm = createVM();
    vm.run('__card0 = 16; __fire(ModCallbacks.MC_POST_GAME_STARTED, false); for i = 1, 3 do __fire(ModCallbacks.MC_POST_UPDATE) end', '=start');
    const before = decodeAll(vm.drain()).filter((m) => m.kind === 'inv').at(-1)!.data as { k: number[] };
    expect(before.k).toEqual([16]);
    // Drop the card (no use callback): slot 0 becomes empty.
    vm.run('__card0 = 0; for i = 1, 3 do __fire(ModCallbacks.MC_POST_UPDATE) end', '=drop');
    const inv = decodeAll(vm.drain()).filter((m) => m.kind === 'inv');
    expect(inv).toHaveLength(1);
    expect((inv[0].data as { k: number[] }).k).toEqual([]);
  });

  it('resends the level when curses change mid-floor (Amnesia, Black Candle...)', () => {
    const vm = createVM();
    vm.run('__fire(ModCallbacks.MC_POST_GAME_STARTED, false)', '=start');
    vm.drain();
    vm.run('for i = 1, 10 do __fire(ModCallbacks.MC_POST_UPDATE) end', '=idle');
    expect(decodeAll(vm.drain()).filter((m) => m.kind === 'level')).toEqual([]);
    vm.run('__curses = 4; for i = 1, 10 do __fire(ModCallbacks.MC_POST_UPDATE) end', '=lost');
    const lv = decodeAll(vm.drain()).filter((m) => m.kind === 'level');
    expect(lv).toHaveLength(1);
    expect((lv[0].data as { curses: number }).curses).toBe(4);
  });

  it('reports pill/card use with evidence that it was the one held', () => {
    const vm = createVM();
    vm.run('__fire(ModCallbacks.MC_POST_GAME_STARTED, false)', '=start');
    vm.drain();
    // Holding The Fool (1) and a pill of color 3 whose effect this run is 14.
    vm.run('__card0 = 1; __pill0 = 3; __pillMap[3] = 14; __fire(ModCallbacks.MC_POST_UPDATE)', '=hold');
    vm.drain();
    vm.run('__fire(ModCallbacks.MC_USE_CARD, 1, player, 0); __fire(ModCallbacks.MC_USE_PILL, 14, player, 0)', '=use');
    const uses = decodeAll(vm.drain()).filter((m) => m.kind === 'use').map((m) => m.data);
    expect(uses).toEqual([
      { t: 'c', id: 1, held: true, flags: 0 },
      { t: 'p', id: 14, color: 3, held: true, flags: 0 },
    ]);
    // Effects not coming from the held pill/card (e.g. other items) carry held=false.
    vm.run('__fire(ModCallbacks.MC_USE_CARD, 5, player, 2048); __fire(ModCallbacks.MC_USE_PILL, 7, player, 0)', '=other');
    const other = decodeAll(vm.drain()).filter((m) => m.kind === 'use').map((m) => (m.data as { held: boolean }).held);
    expect(other).toEqual([false, false]);
    // Another player's use is ignored.
    vm.run('__fire(ModCallbacks.MC_USE_CARD, 1, {}, 0)', '=coop');
    expect(decodeAll(vm.drain()).filter((m) => m.kind === 'use')).toEqual([]);
  });

  it('survives API errors without breaking the game (errors are reported once)', () => {
    const vm = createVM();
    vm.run('__fire(ModCallbacks.MC_POST_GAME_STARTED, false)', '=start');
    vm.drain();
    vm.run('Isaac.FindByType = function() error("boom") end; for i = 1, 9 do __fire(ModCallbacks.MC_POST_UPDATE) end', '=err');
    const msgs = decodeAll(vm.drain());
    expect(msgs.filter((m) => m.kind === 'err')).toHaveLength(1);
  });
});
