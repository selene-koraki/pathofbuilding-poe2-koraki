-- PoB2 Web — Engine Kernel
--
-- A headless JSON-RPC kernel that drives the UNMODIFIED Path of Building 2
-- engine in src/. It speaks newline-delimited JSON over stdin/stdout and never
-- opens a socket: the Node gateway spawns it, brokers WebSocket <-> stdio, and
-- supervises it. All logic lives here and in api/*.lua; src/ is never touched.
--
-- Protocol (one JSON object per line):
--   request : {"id": <n>, "method": "<domain>.<method>", "params": {...}}
--   result  : {"id": <n>, "ok": true,  "result": <value>}
--   error   : {"id": <n>, "ok": false, "error": "<message>"}
--   event   : {"event": "<name>", "data": {...}}          (no id)
--   ready   : {"event": "ready", "data": {...}} emitted once after boot
--
-- Invoked as:  cd src && luajit <repo>/web/engine/kernel.lua
-- (cwd MUST be src/ so the engine's relative LoadModule paths resolve, and
--  LUA_PATH MUST include runtime/lua — web/run.sh and the Dockerfile set both.)

----------------------------------------------------------------------
-- 1. Keep stdout pristine for JSON-RPC.
--    The engine logs through ConPrintf -> print; reroute print to stderr so
--    boot chatter ("Loading main script...", "missing node N", ...) never
--    corrupts the protocol stream. We emit JSON via io.stdout:write directly.
----------------------------------------------------------------------
local realStdout = io.stdout
realStdout:setvbuf("no")
local _print = print
_G.print = function(...)
	local parts = {}
	for i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end
	io.stderr:write(table.concat(parts, "\t"), "\n")
end

----------------------------------------------------------------------
-- 2. Resolve our own directory (web/engine) and make api/* requireable.
--    arg[0] is the absolute path to this script when launched by luajit.
----------------------------------------------------------------------
local selfPath = arg and arg[0] or "kernel.lua"
local ENGINE_DIR = selfPath:match("^(.*)[/\\][^/\\]*$") or "."
package.path = ENGINE_DIR .. "/?.lua;" .. package.path

----------------------------------------------------------------------
-- 3. Boot the engine through the existing headless wrapper.
--    Exposes globals: build, mainObject, newBuild, loadBuildFromXML, runCallback.
----------------------------------------------------------------------
dofile("HeadlessWrapper.lua")

----------------------------------------------------------------------
-- 4. Wire real Deflate/Inflate (HeadlessWrapper stubs them to "").
--    Build import/export codes are base64url(zlib(xml)); without this they are
--    inert. lua-zlib is optional — the kernel still runs file-based builds.
----------------------------------------------------------------------
local okZlib, zlib = pcall(require, "zlib")
local zlibOK = false
if okZlib then
	function Deflate(data)
		local stream = zlib.deflate()
		return (stream(data, "finish"))
	end
	function Inflate(data)
		local stream = zlib.inflate()
		return (stream(data, "finish"))
	end
	local sample = "<PathOfBuilding2>round-trip-ok</PathOfBuilding2>"
	local ok, back = pcall(function() return Inflate(Deflate(sample)) end)
	zlibOK = ok and back == sample
end

----------------------------------------------------------------------
-- 5. Shared kernel state + helpers, exposed to api/* modules.
----------------------------------------------------------------------
local json = require("dkjson")

local K = {}
K.json = json
K.zlibOK = zlibOK
K.loadedId = nil        -- which build id is currently resident in the engine
K.loadedName = nil

-- The live build mode object. HeadlessWrapper keeps `mainObject` as a local, but
-- exports `build` as a global assigned to modes["BUILD"]; SetMode never replaces
-- that object, so the global stays valid across loads.
function K.build()
	return build
end

-- Recompute exactly as the desktop frame loop does (Build.lua OnFrame):
-- set buildFlag, run one frame -> wipeGlobalCache + BuildOutput + RefreshStatList.
function K.recompute()
	local b = K.build()
	b.buildFlag = true
	runCallback("OnFrame")
end

-- Load a build from XML text and mark it resident under the given id/name.
function K.loadXML(id, xml, name)
	loadBuildFromXML(xml, name or "")
	K.loadedId = id
	K.loadedName = name
end

-- Start a brand-new default build resident under the given id/name.
function K.loadNew(id, name)
	newBuild()
	K.loadedId = id
	K.loadedName = name
end

-- Serialize the current build to XML (for the gateway to persist / autosave).
function K.toXML(name)
	return K.build():SaveDB(name or K.loadedName or "build")
end

----------------------------------------------------------------------
-- 6. Method registry. api/* modules register into this table.
----------------------------------------------------------------------
local methods = {}
function K.register(domain, tbl)
	for name, fn in pairs(tbl) do
		methods[domain .. "." .. name] = fn
	end
end

-- Load API domains. Each returns a table of {methodName = function(K, params)}.
-- The build *folder* (library listing, file I/O) is owned by the Node gateway;
-- the kernel owns build *state* and computation.
local DOMAINS = { "build", "character", "config", "calcs", "notes", "skills" }
for _, d in ipairs(DOMAINS) do
	local ok, mod = pcall(require, "api." .. d)
	if ok and type(mod) == "table" then
		K.register(d, mod)
	else
		io.stderr:write(("[kernel] failed to load api.%s: %s\n"):format(d, tostring(mod)))
	end
end

----------------------------------------------------------------------
-- 7. Protocol I/O.
----------------------------------------------------------------------
local function emit(obj)
	local line = json.encode(obj, { keyorder = nil })
	realStdout:write(line, "\n")
end
K.emit = emit

local function emitEvent(name, data)
	emit({ event = name, data = data })
end
K.event = emitEvent

local function dispatch(req)
	local fn = methods[req.method]
	if not fn then
		return { id = req.id, ok = false, error = "unknown method: " .. tostring(req.method) }
	end
	local ok, result = pcall(fn, K, req.params or {})
	if not ok then
		io.stderr:write("[kernel] method error in " .. tostring(req.method) .. ": " .. tostring(result) .. "\n")
		return { id = req.id, ok = false, error = tostring(result) }
	end
	return { id = req.id, ok = true, result = result }
end

----------------------------------------------------------------------
-- 8. Boot complete — announce readiness, then serve requests line by line.
----------------------------------------------------------------------
emitEvent("ready", {
	zlib = zlibOK,
	methods = (function() local t = {} for k in pairs(methods) do t[#t+1] = k end table.sort(t) return t end)(),
})

while true do
	local line = io.read("*l")
	if not line then break end           -- stdin closed -> exit cleanly
	if line ~= "" then
		local req, _, perr = json.decode(line)
		if not req then
			emit({ id = nil, ok = false, error = "bad json: " .. tostring(perr) })
		else
			emit(dispatch(req))
		end
	end
end
