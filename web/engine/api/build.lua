-- api/build — load/save/export the active build and project its state.
local serialize = require("serialize")

local M = {}

-- Load a build from XML and make it the resident build. Returns full state.
-- params: { id, xml, name }
function M.load(K, params)
	K.loadXML(params.id, params.xml or "", params.name)
	K.recompute()
	return serialize.state(K)
end

-- Start a fresh default build. params: { id, name }
function M.new(K, params)
	K.loadNew(params.id, params.name)
	K.recompute()
	return serialize.state(K)
end

-- Full projection of the currently resident build.
function M.getState(K)
	return serialize.state(K)
end

-- Serialize to XML for the gateway to persist (save / autosave). params: { name }
function M.save(K, params)
	return { xml = K.toXML(params and params.name), id = K.loadedId, name = K.loadedName }
end

-- Export a shareable build code: base64url(zlib(xml)). Requires lua-zlib.
function M.exportCode(K)
	if not K.zlibOK then error("export codes require lua-zlib (not available)") end
	local xml = K.toXML()
	local code = common.base64.encode(Deflate(xml)):gsub("+", "-"):gsub("/", "_")
	return { code = code }
end

-- Import a shareable build code into the resident build. params: { id, code, name }
function M.importCode(K, params)
	if not K.zlibOK then error("import codes require lua-zlib (not available)") end
	local code = (params.code or ""):gsub("%s", ""):gsub("-", "+"):gsub("_", "/")
	local xml = Inflate(common.base64.decode(code))
	if not xml or xml == "" then error("could not decode build code") end
	K.loadXML(params.id, xml, params.name)
	K.recompute()
	return serialize.state(K)
end

return M
