-- api/notes — read/write the free-text build notes.
local M = {}

function M.get(K)
	local edit = K.build().notesTab.controls.edit
	return { text = edit.buf or "" }
end

-- params: { text }
function M.set(K, params)
	local notesTab = K.build().notesTab
	notesTab.controls.edit:SetText(params.text or "")
	notesTab.modFlag = true
	return { text = notesTab.controls.edit.buf or "" }
end

return M
