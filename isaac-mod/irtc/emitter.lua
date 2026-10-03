-- Wire emitter. Every message is written with Isaac.DebugString, which appends a line
-- "[INFO] - Lua Debug: <text>" to log.txt. The Companion app tails that file.
--
-- Line format (protocol 1):
--   IRTC|1|<seq>|<kind>|<json>
-- Messages longer than MAX_CHUNK are split (DebugString is limited to ~10KB):
--   IRTC|1|<seq>|+<i>/<n>|<piece>      (pieces concatenated = "<kind>|<json>")
local json = require("irtc.json")

local Emitter = {
  PROTOCOL = 1,
  seq = 0,
  MAX_CHUNK = 6000,
}

local PREFIX = "IRTC|" .. Emitter.PROTOCOL .. "|"

-- Output sink; replaced in unit tests.
Emitter.write = function(line)
  Isaac.DebugString(line)
end

function Emitter.encode(payload)
  return json.encode(payload)
end

function Emitter.sendRaw(kind, body)
  Emitter.seq = Emitter.seq + 1
  local seq = Emitter.seq
  local msg = kind .. "|" .. body
  if #msg <= Emitter.MAX_CHUNK then
    Emitter.write(PREFIX .. seq .. "|" .. msg)
    return
  end
  local n = math.ceil(#msg / Emitter.MAX_CHUNK)
  for i = 1, n do
    local piece = msg:sub((i - 1) * Emitter.MAX_CHUNK + 1, i * Emitter.MAX_CHUNK)
    Emitter.write(PREFIX .. seq .. "|+" .. i .. "/" .. n .. "|" .. piece)
  end
end

function Emitter.send(kind, payload)
  Emitter.sendRaw(kind, json.encode(payload))
end

-- Sends only if the encoded payload differs from the last one sent for this kind.
local lastBodies = {}
function Emitter.sendIfChanged(kind, payload)
  local body = json.encode(payload)
  if lastBodies[kind] == body then return false end
  lastBodies[kind] = body
  Emitter.sendRaw(kind, body)
  return true
end

function Emitter.forget(kind)
  if kind then lastBodies[kind] = nil else lastBodies = {} end
end

return Emitter
