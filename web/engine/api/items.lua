-- api/items — equipment slots, paste-from-game, unique/item DB, item sets,
-- flasks/charms/runes/anoints/enchants (read + equip). Crafting authoring is v2.
-- Calls the same ItemsTab logic the desktop uses; never renders.
local serialize = require("serialize")

local M = {}

local function itab(K) return K.build().itemsTab end

local function recompute(K)
	itab(K):PopulateSlots()
	pcall(function() itab(K):AddUndoState() end)
	K.build().buildFlag = true
	K.recompute()
end

-- Equip an item id into a named slot (0 = unequip).
local function equipTo(K, slotName, itemId)
	local sc = itab(K).slots[slotName]
	if not sc then error("no such slot: " .. tostring(slotName)) end
	sc:SetSelItemId(itemId or 0)
end

----------------------------------------------------------------------
-- Slots
----------------------------------------------------------------------
function M.getSlots(K)
	return serialize.items(K.build())
end

-- Full item detail + coloured tooltip lines for the ItemTooltip. params: { id }
function M.getItem(K, params)
	local item = itab(K).items[tonumber(params.id)]
	if not item then error("no such item") end
	local tooltip = new("Tooltip")
	pcall(function() itab(K):AddItemTooltip(tooltip, item, nil, true) end)
	local lines = {}
	for _, l in ipairs(tooltip.lines or {}) do
		if l.text then lines[#lines + 1] = { size = l.size, text = l.text } end
	end
	return {
		id = item.id,
		name = item.name,
		rarity = item.rarity,
		baseName = item.baseName,
		type = item.base and item.base.type,
		tooltip = lines,
	}
end

----------------------------------------------------------------------
-- Equip / unequip / paste
----------------------------------------------------------------------
-- params: { text, slot? } — parse a raw item and equip it.
function M.pasteItem(K, params)
	local ok, item = pcall(function() return new("Item", params.text or "") end)
	if not ok or not item or not item.baseName then
		error("could not parse item text")
	end
	itab(K):AddItem(item, true)
	local slotName = params.slot or item:GetPrimarySlot()
	if not itab(K).slots[slotName] then slotName = item:GetPrimarySlot() end
	equipTo(K, slotName, item.id)
	recompute(K)
	local st = serialize.state(K)
	st.equippedItemId = item.id
	st.equippedSlot = slotName
	return st
end

-- params: { slot, itemId } — equip an existing inventory item.
function M.equip(K, params)
	equipTo(K, params.slot, tonumber(params.itemId))
	recompute(K)
	return serialize.state(K)
end

-- params: { slot }
function M.unequip(K, params)
	equipTo(K, params.slot, 0)
	recompute(K)
	return serialize.state(K)
end

-- Toggle a flask/charm slot active. params: { slot, active }
function M.setSlotActive(K, params)
	local sc = itab(K).slots[params.slot]
	if not sc then error("no such slot") end
	sc.active = params.active and true or false
	if itab(K).activeItemSet[params.slot] then
		itab(K).activeItemSet[params.slot].active = sc.active
	end
	recompute(K)
	return serialize.state(K)
end

----------------------------------------------------------------------
-- Unique / item DB
----------------------------------------------------------------------
-- params: { q?, slot?, limit? }
function M.searchUniques(K, params)
	local q = (params.q or ""):lower()
	local slot = params.slot
	local limit = tonumber(params.limit) or 60
	local out = {}
	for name, item in pairs(main.uniqueDB.list or {}) do
		local matchName = q == "" or name:lower():find(q, 1, true)
		local primary = item.GetPrimarySlot and item:GetPrimarySlot() or nil
		local matchSlot = (not slot) or primary == slot or (primary and primary:gsub(" %d$", "") == slot)
		if matchName and matchSlot then
			out[#out + 1] = {
				name = name,
				rarity = item.rarity,
				baseName = item.baseName,
				type = item.base and item.base.type,
				slot = primary,
			}
		end
	end
	table.sort(out, function(a, b) return a.name < b.name end)
	while #out > limit do table.remove(out) end
	return { uniques = out }
end

-- Instantiate a unique from the DB and equip it. params: { name, slot? }
function M.equipUnique(K, params)
	local db = main.uniqueDB.list[params.name]
	if not db then error("no such unique: " .. tostring(params.name)) end
	local item = new("Item", db.raw)
	itab(K):AddItem(item, true)
	local slotName = params.slot or item:GetPrimarySlot()
	equipTo(K, slotName, item.id)
	recompute(K)
	return serialize.state(K)
end

----------------------------------------------------------------------
-- Item sets
----------------------------------------------------------------------
function M.listSets(K)
	local sets = {}
	for _, id in ipairs(itab(K).itemSetOrderList) do
		local s = itab(K).itemSets[id]
		if s then sets[#sets + 1] = { id = id, title = s.title, active = id == itab(K).activeItemSetId } end
	end
	return { sets = sets, activeId = itab(K).activeItemSetId }
end

-- params: { id }
function M.setActiveSet(K, params)
	itab(K):SetActiveItemSet(tonumber(params.id))
	K.build().buildFlag = true
	K.recompute()
	return serialize.state(K)
end

-- params: { title? }
function M.newSet(K, params)
	local nextId = 1
	for id in pairs(itab(K).itemSets) do nextId = math.max(nextId, id + 1) end
	itab(K):NewItemSet(nextId, params.title or ("Set " .. nextId))
	itab(K).modFlag = true
	return M.listSets(K)
end

-- params: { id, title }
function M.renameSet(K, params)
	itab(K):RenameItemSet(tonumber(params.id), tostring(params.title or ""))
	return M.listSets(K)
end

-- params: { id }
function M.deleteSet(K, params)
	local id = tonumber(params.id)
	local idx
	for i, sid in ipairs(itab(K).itemSetOrderList) do if sid == id then idx = i break end end
	if not idx then error("no such set") end
	itab(K):DeleteItemSet(id, idx)
	return M.listSets(K)
end

return M
