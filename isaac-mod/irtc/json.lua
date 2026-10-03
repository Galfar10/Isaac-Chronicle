-- Minimal JSON encoder (encode only). Self-contained so the wire format does not
-- depend on the game's bundled json module and can be unit-tested outside Isaac.
local json = {}

local ARRAY_MT = { __irtc_array = true }

-- Marks a table as a JSON array (needed for empty arrays).
function json.arr(t)
  return setmetatable(t or {}, ARRAY_MT)
end

local escapes = {
  ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f',
  ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t',
}

local function encodeString(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    return escapes[c] or string.format('\\u%04x', c:byte())
  end) .. '"'
end

local function encodeNumber(n)
  if n ~= n or n == math.huge or n == -math.huge then return 'null' end
  if math.type(n) == 'integer' then return string.format('%d', n) end
  if n == math.floor(n) and math.abs(n) < 1e15 then return string.format('%d', math.floor(n)) end
  local s = string.format('%.4f', n):gsub('0+$', ''):gsub('%.$', '')
  return s
end

local function isArray(t)
  if getmetatable(t) == ARRAY_MT then return true end
  return t[1] ~= nil
end

local encode

local function encodeTable(t, depth)
  if depth > 16 then return 'null' end
  local out = {}
  if isArray(t) then
    for i = 1, #t do out[i] = encode(t[i], depth + 1) end
    return '[' .. table.concat(out, ',') .. ']'
  end
  local keys = {}
  for k in pairs(t) do keys[#keys + 1] = tostring(k) end
  table.sort(keys) -- deterministic output => cheap change detection by string compare
  for i = 1, #keys do
    local k = keys[i]
    local v = t[k]
    if v == nil then v = t[tonumber(k)] end
    out[i] = encodeString(k) .. ':' .. encode(v, depth + 1)
  end
  return '{' .. table.concat(out, ',') .. '}'
end

encode = function(v, depth)
  local tv = type(v)
  if tv == 'nil' then return 'null'
  elseif tv == 'boolean' then return v and 'true' or 'false'
  elseif tv == 'number' then return encodeNumber(v)
  elseif tv == 'string' then return encodeString(v)
  elseif tv == 'table' then return encodeTable(v, depth or 0)
  end
  return 'null'
end

function json.encode(v)
  return encode(v, 0)
end

return json
