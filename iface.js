var fs = require('fs')

const fetch = require('node-fetch')
const Bluebird = require('bluebird')
fetch.Promise = Bluebird

function getJson(url, callback) {
	fetch(url)
		.then(res => res.json())
		.then(r => {
			callback(null, r)
		})
		.catch(e => {
			callback(e, null)
		})
}

var keywin
var remote = require('electron').remote
global.app = remote.app
var dialog = remote.require('electron').dialog
var win = remote.getCurrentWindow()
var shell = require('electron').shell
var started = false
var taskData = { cities: '', rubrics: '', name: '' }
var dat = {
	countries: require(__dirname + '/dat/countries.json'),
	cities: require(__dirname + '/dat/cities.json'),
	categories: require(__dirname + '/dat/categories.json')
}

var version

var property

var parser = require(__dirname + '/parser4.js')

function isDemo() {
	if (!dat.user) return true
	else return false
}

function getCityData() {
	var countries = []

	for (var id in dat.countries) {
		var cities = []
		for (var i = 0; i < dat.cities.length; i++) {
			if (dat.cities[i].country == id) {
				cities.push({
					id: dat.cities[i].id,
					value: dat.cities[i].name,
					code: dat.cities[i].code
				})
			}
		}

		if (cities.length > 0) {
			countries.push({
				id: id,
				open: false,
				value: dat.countries[id],
				data: cities
			})
		}

	}

	return countries
}

function getCategoryData() {
	var categories = []

	for (var k = 0; k < dat.categories.length; k++) {
		var rubrics = []
		for (var i = 0; i < dat.categories[k].children.length; i++) {
			rubrics.push({
				id: dat.categories[k].children[i].id,
				value: dat.categories[k].children[i].name
			})
		}

		categories.push({
			id: dat.categories[k].id,
			open: false,
			value: dat.categories[k].name,
			data: rubrics
		})
	}

	return [{
		id: 'root',
		open: true,
		value: 'Все',
		data: categories
	}]
}

function loadDat(callback) {
	var project = '32'
	getJson('https://parselab.org/key/key3.php?project=' + project + '&key=' + parser.licenseKey + '&key_user', (e, r) => {
		if (!r.error) dat.user = r

		if (isDemo()) {
			dat.countries = { ru: dat.countries.ru }
			for (var i = 0; i < dat.cities.length; i++) {
				if (dat.cities[i].id == '69') {
					dat.cities = [dat.cities[i]]
				}
			}
		} 
/* 		else {
			$$("profile").define("label", r.email);
			$$("profile").refresh();
			
		}
 */
		callback()
	})
}


exports.start = () => {
	interface_init()
	loadDat(() => {

		reloadBases()
		if (isDemo()) {
			$$('keywin').show()
		}
	})
}

exports.ready = (callback) => {
	webix.ready(function () {
		callback()
	})
}

function mark_finished(value, data) {
	if (data.finished)
		return "highlight"
}

function mark_minus(value, data) {
	if (value == 0) {
		return "-"
	} else {
		return value
	}
}

function interface_init() {
	keywin = webix.ui({
		view: "window",
		id: "keywin",
		move: true,
		modal: true,
		height: 600,
		resize: true,
		position: "center",
		head: {
			view: "toolbar",
			cols: [
				{ view: "label", label: "Неактивированная версия парсера" }
			]
		},
		body: {
			rows: [
				{ view: "text", id: "keytext", value: '', label: 'Если у вас есть лицензионный ключ, введите его в поле ниже и нажмите "Активировать"', labelPosition: "top", width: 700 },
				{
					margin: 5,
					cols: [
						{ view: "button", value: "Активировать", click: setKey },
						{ view: "button", value: "Бесплатная версия", click: loadDemo },
						{ view: "button", value: "Купить ключ", click: buyParser, type: "form" }
					]
				},
			]
		}
	})

	webix.ui({
		view: "window",
		id: "propertywin",
		move: true,
		modal: true,
		height: 300,
		width: 330,
		resize: true,
		position: "center",
		head: {
			view: "toolbar",
			cols: [
				{ view: "label", label: "Настройки", id: "keylabel" }
			]
		},
		body: {
			rows: [
				{
					view: "property", id: "sets", nameWidth: 250, disabled: (dat.user) ? true : false,
					elements: [
						{ label: "Собирать адреса e-mail с сайтов", type: "checkbox", id: "parse_emails", checkValue: true, uncheckValue: false }

					]
				},
				{
					margin: 5, cols: [
						{ view: "button", value: "Отмена", click: "$$('propertywin').hide();" },
						{ view: "button", value: "Сохранить", type: "form" }
					]
				},
			]
		}
	})

	webix.ui({
		view: "window",
		id: "exportwin",
		move: true,
		modal: true,
		height: 300,
		width: 330,
		resize: true,
		position: "center",
		head: {
			view: "toolbar",
			cols: [
				{ view: "label", label: "Выгрузка организаций" }
			]
		},
		body: {
			rows: [
				{
					cols: [
						{ view: "label", label: "Выгружено организаций:" },
						{ view: "label", label: "0", id: "countlabel" }
					]
				}
			]
		}
	})


	webix.ui({
		rows: [
			{
				view: "toolbar", cols: [
					{ view: "button", id: "basebutton", type: "iconButton", icon: "fas fa-plus-circle", label: "Создать базы", autowidth: true, click: selectCity, align: "left" },
					{ view: "button", hidden: false, id: "ctlbutton", disabled: true, type: "iconButton", icon: "fas fa-play", label: "Старт", autowidth: true, click: startParsing, tooltip: "Запуск парсинга" },
					{ gravity: 4 },
					{ view: "button", hidden: true, id: "reloadbutton", type: "iconButton", tooltip: "Обновить", icon: "fas fa-refresh", width: 36, click: reloadBases, align: "right" },
					{ view: "button", id: "profile", type: "icon", icon: "user", width:200, hidden: true}
				]
			},
			{
				view: "datatable",
				scrollX: false,
				id: "basestable",
				eachRow: mark_minus,
				columns: [
					{ id: "status", header: { content: "masterCheckbox", css: "center", id: "masterCheckbox", contentId: "mc1" }, width: 60, css: "center", checkValue: "1", uncheckValue: "0", template: "{common.checkbox()}" },
					{ id: "id", header: "", width: 50 },
					{ id: "title", header: "Город", width: 200 },
					{ id: "task_title", header: "Задача", width: 200 },
					{ id: "dbname", header: "Имя базы", width: 200 },
					{ id: "count", header: "Организаций", width: 100, format: mark_minus, cssFormat: mark_finished }
				],
			},
			{
				view: "toolbar", cols: [
					{ view: "button", type: "iconButton", icon: "fas fa-download", label: "Выгрузить выделенные", autowidth: true, id: "exportbutton", click: exportBases, align: "left", tooltip: "Выгрузить выделенные базы" },
					{ view: "button", type: "iconButton", icon: "fas fa-trash", label: "Удалить выделенные", autowidth: true, id: "deletebutton", click: deleteBases, align: "left", tooltip: "Удалить выделенные базы" },
					{ gravity: 4 },
					{ view: "button", hidden: true, type: "iconButton", icon: "fas fa-cog", label: "Настройки", autowidth: true, id: "propertybutton", align: "right", tooltip: "Настройки", disabled: true }
				]
			},
		]
	})

	webix.ui({
		view: "window",
		id: "mywin",
		move: true,
		modal: true,
		height: 500,
		width: 500,
		resize: true,
		position: "center",
		head: {
			view: "toolbar",
			cols: [
				{ view: "label", label: "Выберите города для парсинга", id: "mylabel" },
				{ view: "button", label: 'Закрыть', width: 100, align: 'right', click: "$$('mywin').hide();" }
			]
		},
		body: {
			rows: [
				{ id: "lll" },
				{ id: "mybutton" }
			]
		}
	})

	$$("mywin").attachEvent("onKeyPress", function (code) {
		if (code == '27') {
			this.hide()
		}
	})
}

function selectTask() {
	$$("mytree").filter("#value#", '')
	taskData.rubrics = getSelectedRubrics()

	webix.ui({
		id: "lll", rows: [{
			view: "form",
			id: "mytree",
			width: 300,
			elements: [
				{ view: "label", label: 'Например: "Автосалоны Абакана"' },
				{ id: "tasktext", view: "text" },
			]
		}]
	}, $$('lll'))

	webix.ui(
		{ view: "button", id: "mybutton", value: "Завершить", width: 100, click: createFilters, hotkey: "enter" }
		, $$('mybutton'))

	webix.ui(
		{ view: "label", label: "Укажите имя задачи", id: "mylabel" }
		, $$('mylabel'))

	$$('mywin').show()
	$$('tasktext').focus()
}

function selectCity() {
	webix.ui({
		id: "lll", rows: [
			{ view: "tree", id: "mytree", threeState: true, scroll: "y", width: 400, template: "{common.icon()} {common.checkbox()}&nbsp<span>#value#</span>", data: getCityData(), select: false }
		]
	}, $$('lll'))

	webix.ui(
		{ view: "button", id: "mybutton", value: "Продолжить", width: 100, click: createBases }
		, $$('mybutton'))

	webix.ui(
		{ view: "label", label: "Выберите города для парсинга", id: "mylabel" }
		, $$('mylabel'))

	$$('mywin').show()
}

function reloadBases() {
	var tasks = parser.getBases()

	if ($$('ctlbutton')) {
		if (tasks.length > 0) {
			$$('ctlbutton').enable()
			if (!started) {
				$$('deletebutton').enable()
				$$('exportbutton').enable()
			}
		}
		else {
			$$('ctlbutton').disable()
			$$('deletebutton').disable()
			$$('exportbutton').disable()
		}
	}

	$$('basestable').parse(tasks)
	uncheckMaster()
}

function uncheckMaster() {
	$$("basestable").getHeaderContent("mc1").uncheck()
}

function esc() {
	$$('searchtext').refresh()
	$$('searchtext').setValue('')
	$$('searchtext').focus()
	$$("mytree").filter("#value#", $$('searchtext').getValue())
}

function createBases() {
	var cities = getSelectedCities()
	if (cities.length > 0) {
		taskData.cities = cities

		webix.ui({
			id: "lll",
			rows: [
				{ view: "text", id: "searchtext", placeholder: "Поиск" },
				{
					view: "tree", filterMode: {},
					id: "mytree", threeState: true, scroll: "y", template: "{common.icon()} {common.checkbox()}&nbsp<span>#value#</span>", select: false, data: getCategoryData(), datatype: "json", ready: function () {
						this.checkItem("root")
					}
				}
			]
		}, $$('lll'))

		$$("searchtext").attachEvent("onKeyPress", function (code) {
			if (code == '27') {
				esc()
			}
		})

		$$("mytree").attachEvent("onKeyPress", function (code) {
			if (code == '27') {
				esc()
			}
		})

		$$("searchtext").attachEvent("onTimedKeyPress", function () {
			if (this.getValue().length > 1)
				$$("mytree").filter("#value#", this.getValue())
			else
				$$("mytree").filter()
		})

		webix.ui(
			{ view: "button", id: "mybutton", inputWidth: 100, label: "Продолжить", click: selectTask }
			, $$('mybutton'))

		webix.ui(
			{ view: "label", label: "Выберите категории и рубрики", id: "mylabel" }
			, $$('mylabel'))
		$$('mytree').checkItem("root")

		$$('searchtext').focus()
	}
	else {
		webix.message({ type: "error", text: "Необходимо выбрать хотя бы один город для создания базы" })
	}
}

function getSelectedCities() {
	var countries = $$('mytree').serialize()
	var res = []

	for (var i = 0; i < countries.length; i++) {
		for (var k = 0; k < countries[i].data.length; k++) {
			if (countries[i].data[k].checked) {
				res.push({
					id: countries[i].data[k].id,
					title: countries[i].data[k].value,
					code: countries[i].data[k].code
				})
			}
		}
	}

	return res
}

function getSelectedRubrics() {
	var root = $$('mytree').serialize()
	var categories = root[0].data
	var res = []

	for (var i = 0; i < categories.length; i++) {
		for (var k = 0; k < categories[i].data.length; k++) {
			if (categories[i].data[k].checked) {
				res.push(categories[i].data[k].id)
			}
		}
	}

	return res
}

function createFilters() {
	if ($$('tasktext').getValue().trim() != '') {
		taskData.name = $$('tasktext').getValue()
		parser.createTask(taskData.name, taskData.cities, taskData.rubrics)

		$$('mywin').hide()
		$$('basestable').clearAll()
		reloadBases()
	}
	else {
		$$('tasktext').setValue('')
		$$('tasktext').focus()
	}
}

function deleteBases() {
	if (getCheckedCount() > 0) {
		var tasks = $$('basestable').serialize()
		var checked = []

		for (var i = 0; i < tasks.length; i++) {
			if (tasks[i].status == '1') {
				checked.push(tasks[i].dbname)
			}
		}

		parser.removeBases(checked)

		$$('basestable').clearAll()
		reloadBases()
	}
}

function exportBases() {
	if (getCheckedCount() > 0) {
		var dp = ''

		if (isDemo()) {
			dp = 'gis_abakan'
		}
		$$('exportbutton').disable()
		dialog.showSaveDialog({ buttonLabel: "Выгрузить", defaultPath: dp, filters: [{ name: 'Excel', extensions: ['csv'] }] }, function (filename) {
			$$('exportbutton').enable()
			if (filename) {
				if (getCheckedCount() > 0) {
					var tasks = $$('basestable').serialize()
					var checked = []

					for (var i = 0; i < tasks.length; i++) {
						if (tasks[i].status == '1' && tasks[i].count > 0) {
							checked.push(tasks[i])
						}
					}

					$$('exportwin').show()
					$$('countlabel').setValue('0')

					parser.on('msg', (c) => {
						$$('countlabel').setValue(c.toString())
					})

					parser.export(checked, filename, (e) => {
						webix.message("Выгрузка выполнена")
						$$('exportwin').hide()
						uncheckMaster()
						shell.openItem(filename)
					})
				}
			}
		})
	}

}

function buyParser() {
	shell.openExternal(JSON.parse(dat).buy_url)
}

function setKey() {
	if ($$('keytext').getValue().trim() != '') {
		parser.setKey($$('keytext').getValue(), function (res) {
			if (res) {
				webix.alert("Ваш ключ успешно активирован!", function () {
					$$('keywin').hide()
					win.reload()
				})
			} else {
				webix.alert("Указанный вами ключ недействителен")
				$$('keytext').setValue('')
			}
		})
	}
	else {
		$$('keytext').setValue('')
	}
}

function getCheckedCount() {
	var cnt = 0
	$$('basestable').eachRow(
		function (row) {
			if ($$('basestable').getItem(row).status == '1') {
				cnt++
			}
		}
	)

	return cnt
}

function startParsing() {
	started = true
	$$('deletebutton').disable()
	$$('exportbutton').disable()
	$$('propertybutton').disable()
	webix.ui({ view: "button", id: "ctlbutton", type: "iconButton", icon: "fas fa-stop", label: "Стоп", autowidth: true, click: stopParsing, tooltip: "Остановка парсинга" }, $$('ctlbutton'))
	parser.start((r) => {
		var id = $$('basestable').getIdByIndex(parser.curIndex)
		var record = $$('basestable').getItem(id)
		if (r.type) {
			if (r.type == 'base') {
				$$('basestable').addCellCss(id, "count", "highlight")
				webix.message("Сборка города " + r.cityTitle + " завершена")
			} else if (r.type == 'finish') {
				webix.message("Парсинг завершен")
			}
		} else {
			record['count'] = r
			$$('basestable').updateItem(id, record)
		}
	}, () => {
		stopParsing()
	})
}

function loadDemo() {
	keywin.close()
}

function stopParsing() {
	started = false
	parser.stop()

	$$('deletebutton').enable()
	$$('exportbutton').enable()
	webix.ui({ view: "button", id: "ctlbutton", type: "iconButton", icon: "fas fa-play", label: "Старт", autowidth: true, click: startParsing, tooltip: "Запуск парсинга" }, $$('ctlbutton'))
}

