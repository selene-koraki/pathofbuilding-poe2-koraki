-- Path of Building 2 — local engine service (proof of concept)
--
-- Boots the existing PoB2 calculation engine headlessly (no SimpleGraphic, no
-- Wine) and exposes it over a small HTTP API on localhost, so a browser UI can
-- drive it. This file lives entirely outside src/ and does not modify the engine.
--
-- Run via web/run.sh (which sets the working directory to src/ and LUA_PATH).

----------------------------------------------------------------------
-- Boot the engine through the existing headless wrapper.
-- After this runs we have the globals it exports: `build`, `mainObject`,
-- `newBuild`, `loadBuildFromXML`, plus the whole engine API.
----------------------------------------------------------------------
dofile("HeadlessWrapper.lua")

local socket = require("socket")
local json = require("dkjson")
local okZlib, zlib = pcall(require, "zlib")

----------------------------------------------------------------------
-- Real Deflate/Inflate (the headless wrapper stubs these to "").
-- PoB import/export codes are base64url( zlib-compressed XML ), so we wire
-- zlib here. The build-file demo below doesn't need them, but this makes the
-- headless host "complete" and unlocks import-code support later.
----------------------------------------------------------------------
if okZlib then
	function Deflate(data)
		local stream = zlib.deflate()
		return (stream(data, "finish"))
	end
	function Inflate(data)
		local stream = zlib.inflate()
		return (stream(data, "finish"))
	end
	-- Self-test the round-trip so a format regression is obvious at startup.
	local sample = "<PathOfBuilding2>round-trip-ok</PathOfBuilding2>"
	local ok, back = pcall(function() return Inflate(Deflate(sample)) end)
	print(("[engine] Deflate/Inflate via zlib: %s"):format(ok and back == sample and "OK" or "FAILED"))
else
	print("[engine] lua-zlib not found; import/export codes disabled (build files still work)")
end

----------------------------------------------------------------------
-- Config
----------------------------------------------------------------------
local PORT     = tonumber(os.getenv("POB_PORT")) or 8088
local WEB_ROOT = os.getenv("POB_WEB_ROOT")  or "../web/public"
local BUILD_DIR= os.getenv("POB_BUILD_DIR") or "../web/builds"

----------------------------------------------------------------------
-- Build folder helpers (plain filesystem; the engine's own path logic is
-- bypassed so this shares files cleanly with the desktop/Wine app).
----------------------------------------------------------------------
local function listBuilds()
	local names = {}
	-- Linux-only directory listing for the PoC.
	local p = io.popen('ls -1 "'..BUILD_DIR..'" 2>/dev/null')
	if p then
		for line in p:lines() do
			local name = line:match("^(.+)%.xml$")
			if name then names[#names + 1] = name end
		end
		p:close()
	end
	table.sort(names)
	return names
end

local function readBuild(name)
	local f = io.open(BUILD_DIR.."/"..name..".xml", "r")
	if not f then return nil end
	local xml = f:read("*a")
	f:close()
	return xml
end

-- Ensure there is at least one build so the demo works with zero setup:
-- generate a default character straight from the engine.
local function ensureSampleBuild()
	if #listBuilds() > 0 then return end
	os.execute('mkdir -p "'..BUILD_DIR..'"')
	newBuild()
	local xml = build:SaveDB("Sample")
	if xml then
		local f = io.open(BUILD_DIR.."/Sample.xml", "w")
		if f then f:write(xml); f:close(); print("[engine] wrote sample build") end
	end
end

----------------------------------------------------------------------
-- The core: load a build and serialize the engine's own computed sidebar.
-- `build.controls.statBox.list` is the exact formatted stat list the desktop
-- UI renders, including the game's ^-colour escapes — we pass those straight
-- through and let the browser map them to the PoE2 palette.
----------------------------------------------------------------------
local function computeBuild(name)
	local xml = readBuild(name)
	if not xml then return nil, "build not found" end

	-- Fresh state each request: wipe the calc cache, then load + compute.
	if GlobalCache and GlobalCache.cachedData then wipeGlobalCache() end
	loadBuildFromXML(xml, name)
	pcall(function() build:RefreshStatList() end)

	local stats = {}
	for _, e in ipairs(build.controls.statBox.list or {}) do
		if e[1] and e[2] then
			stats[#stats + 1] = { label = e[1], value = e[2] }
		elseif e[1] then
			stats[#stats + 1] = { header = e[1] }
		else
			stats[#stats + 1] = { spacer = true }
		end
	end

	local meta = {}
	pcall(function() meta.level     = build.characterLevel end)
	pcall(function() meta.class     = build.spec and build.spec.curClassName end)
	pcall(function() meta.ascendancy= build.spec and build.spec.curAscendClassName end)
	pcall(function() meta.mainSkill = build.calcsTab.mainEnv.player.mainSkill.activeEffect.grantedEffect.name end)

	return { name = name, meta = meta, stats = stats }
end

----------------------------------------------------------------------
-- Tiny static-file + JSON HTTP server (single client at a time is plenty
-- for a local single-user tool).
----------------------------------------------------------------------
local MIME = {
	html = "text/html; charset=utf-8", css = "text/css", js = "application/javascript",
	json = "application/json", svg = "image/svg+xml", png = "image/png", ico = "image/x-icon",
}

local function urldecode(s)
	return (s:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end))
end

local function sendResponse(client, status, contentType, body)
	body = body or ""
	client:send(("HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\nConnection: close\r\n\r\n")
		:format(status, contentType, #body))
	client:send(body)
end

local function sendJSON(client, tbl)
	sendResponse(client, "200 OK", MIME.json, json.encode(tbl))
end

local function serveStatic(client, path)
	if path == "/" then path = "/index.html" end
	path = path:gsub("%.%.", "") -- no traversal
	local ext = path:match("%.(%w+)$")
	local f = io.open(WEB_ROOT..path, "rb")
	if not f then return sendResponse(client, "404 Not Found", MIME.html, "Not found") end
	local body = f:read("*a"); f:close()
	sendResponse(client, "200 OK", MIME[ext] or "application/octet-stream", body)
end

local function handle(client, method, path)
	local route, query = path:match("^([^?]*)%??(.*)$")
	if route == "/api/builds" then
		sendJSON(client, { builds = listBuilds() })
	elseif route == "/api/build" then
		local name = urldecode(query:match("name=([^&]+)") or "")
		local data, err = computeBuild(name)
		if data then sendJSON(client, data)
		else sendResponse(client, "404 Not Found", MIME.json, json.encode({ error = err })) end
	else
		serveStatic(client, route)
	end
end

ensureSampleBuild()

local server = assert(socket.bind("127.0.0.1", PORT))
print(("[engine] PoB2 engine service ready on http://127.0.0.1:%d  (builds: %s)"):format(PORT, BUILD_DIR))

while true do
	local client = server:accept()
	if client then
		client:settimeout(5)
		local reqLine = client:receive("*l")
		if reqLine then
			-- drain headers
			repeat local l = client:receive("*l") until not l or l == ""
			local method, path = reqLine:match("^(%u+)%s+(%S+)")
			local ok, err = pcall(handle, client, method or "GET", path or "/")
			if not ok then
				pcall(sendResponse, client, "500 Internal Server Error", MIME.json,
					json.encode({ error = tostring(err) }))
			end
		end
		client:close()
	end
end
