/* eslint-disable no-unused-vars */

const fs = require('fs')
//var dataDir = '/data/parser_data'
const fetch = require('node-fetch')
const Promise = require('bluebird')
var iconv = require('iconv-lite');
const EventEmitter = require('events');
fetch.Promise = Promise
var dataDir = remote.app.getPath('userData')

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)
if (!fs.existsSync(dataDir + '/db')) fs.mkdirSync(dataDir + '/db')
if (!fs.existsSync(dataDir + '/key.json')) fs.writeFileSync(dataDir + '/key.json', '"demo"')
if (!fs.existsSync(dataDir + '/tasks.json')) fs.writeFileSync(dataDir + '/tasks.json', '{"tasks":[],"count":0}')

if (!fs.existsSync(dataDir + '/config.json')) fs.writeFileSync(dataDir + '/config.json', '{"encoding":"win1251"}')
var config = require(dataDir + '/config.json')

var firmurl4 = 'http://db.parselab.org/[city]/[category].json?key=[key]'

function parseFirmUrl(category, city, key) {
	return firmurl4
		.replace('[category]', category)
		.replace('[city]', city)
		.replace('[key]', key)
}

var fields = [
	[0, 'id', ''],
	[1, 'name', ''],
	[2, 'city_name', ''],
	[3, 'geometry_name', ''],
	[4, 'post_code', ''],
	[5, 'phone', ''],
	[7, 'email', ''],
	[8, 'website', ''],
	[9, 'vkontakte', ''],
	[10, 'instagram', ''],
	[11, 'lon', ''],
	[12, 'lat', ''],
	[13, 'category', ''],
	[14, 'subcategory', '']
]


class Parser extends EventEmitter {
	constructor() {
		super()
		this.pool = []
		this.curCity
		this.curTaskId
		this.curIndex
		this.ids
		this.pk
		this.co
		this.exportCo
		this.exportIds
		this.started = false
		this.fd
		this.licenseKey = this.getKey()
		this.headers = {
			'User-Agent': 'Parser2Gis/' + currentVersion
		}

		this.fields = fields
	}

	init() {

	}

	start(msg, callback) {
		this.started = true
		this.parseBase(msg, callback)
	}

	createPool(base) {
		var status = this.getBaseStatus(base.taskId, base.city.code)
		if (status.count > 0 && !status.finished) {
			this.pool = status.pool
			this.ids = this.getBaseIndex(base.taskId, base.city.code)

			this.pk = this.getBasePk(base.taskId, base.city.code)
			this.co = status.count
		} else {
			this.ids = {}
			this.pk = []
			this.co = 0
			for (var i = 0; i < base.rubrics.length; i++) {
				this.pool.push(base.rubrics[i])
			}
		}
	}

	parseBase(msg, callback) {
		var base = this.getFirstBase()
		if (!base) {
			msg({ type: "finish" })
			callback()
		} else {
			var city = base.city
			var taskId = base.taskId
			var rubrics = base.rubrics
			this.curCity = city
			this.curTaskId = taskId
			var baseDir = dataDir + '/db/gis_' + taskId + '_' + city.code

			if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir)
			if (!fs.existsSync(baseDir + '/index.json')) fs.writeFileSync(baseDir + '/index.json', '{}')
			if (!fs.existsSync(baseDir + '/pk.json')) fs.writeFileSync(baseDir + '/pk.json', '{}')


			this.createPool(base)

			this.parseRubric(msg, () => {
				//this.setBaseFinished(taskId, city.code)
				if (this.started) {
					this.finish()
					msg({ type: "base", cityTitle: city.title })
					this.parseBase(msg, callback)
				} else {
					callback()
				}
			})
		}
	}

	parseRubric(msg, callback) {
		var rubricId = this.pool.shift()

		if (this.started) {
			var url = parseFirmUrl(rubricId, this.curCity.id, this.licenseKey)
			this.getJson(url, (e, r) => {
				var c = 0
				var re = []
				var idx = 0
				for (var i = 0; i < r.length; i++) {
					if (!this.ids.hasOwnProperty(r[i][0])) {
						this.ids[r[i][0]] = [rubricId, i]
						re.push(r[i])
						this.pk.push([parseInt(rubricId, 10), idx])

						c++
						idx++
					}
				}

				this.co += c

				if (c > 0) msg(this.co)

				fs.writeFile(dataDir + '/db/gis_' + this.curTaskId + '_' + this.curCity.code + '/' + rubricId + '.json', JSON.stringify(re), (e) => {
					if (this.pool.length > 0) {
						this.parseRubric(msg, callback)
					} else {
						this.finish()
						callback()
					}
				})
			})
		} else {
			this.pool.unshift(rubricId)
			this.pause()
			callback()
		}
	}

	getJson(url, callback) {
		fetch(url, { headers: this.headers })
			.then((res) => {
				if (res.headers.get('ver') != 'ParseLab/' + currentVersion) {
					this.emit('upgrade')
				}
				return res.json()
			})
			.then(r => {

				callback(null, r)
			})
			.catch(e => {
				callback(e, null)
			})
	}

	getText(url, callback) {
		fetch(url, { headers: this.headers })
			.then(res => res.text())
			.then(r => {
				callback(null, r)
			})
			.catch(e => {
				callback(e, null)
			})
	}

	createTask(name, cities, rubrics) {
		var tasks = JSON.parse(fs.readFileSync(dataDir + '/tasks.json'))
		tasks.count++

		tasks.tasks.push({
			id: tasks.count,
			name: name,
			cities: cities,
			rubrics: rubrics
		})

		fs.writeFileSync(dataDir + '/tasks.json', JSON.stringify(tasks))
	}

	getTasks() {
		return JSON.parse(fs.readFileSync(dataDir + '/tasks.json')).tasks
	}

	getTasksCount() {
		return JSON.parse(fs.readFileSync(dataDir + '/tasks.json')).count
	}

	removeBases(ids) {
		var tasks = JSON.parse(fs.readFileSync(dataDir + '/tasks.json'))
		var newTasks = []

		for (var i = 0; i < tasks.tasks.length; i++) {
			var taskId = tasks.tasks[i].id
			var newCities = []
			for (var k = 0; k < tasks.tasks[i].cities.length; k++) {
				var cityCode = tasks.tasks[i].cities[k].code
				var baseId = 'gis_' + taskId + '_' + cityCode

				if (!ids.includes(baseId)) {
					newCities.push(tasks.tasks[i].cities[k])
				}
			}

			if (newCities.length > 0) {
				tasks.tasks[i].cities = newCities
				newTasks.push(tasks.tasks[i])
			}
		}
		tasks.tasks = newTasks
		fs.writeFileSync(dataDir + '/tasks.json', JSON.stringify(tasks))
	}

	removeTasks(ids) {
		var tasks = JSON.parse(fs.readFileSync(dataDir + '/tasks.json'))
		for (var i = 0; i < tasks.tasks.length; i++) {
			if (ids.includes(tasks.tasks[i].id)) {
				tasks.tasks.splice(i, 1)
			}
		}

		fs.writeFileSync(dataDir + '/tasks.json', JSON.stringify(tasks))
	}

	getBases() {
		var tasks = this.getTasks()
		var res = []
		this.co = 0
		for (var k = 0; k < tasks.length; k++) {
			for (var i = 0; i < tasks[k].cities.length; i++) {
				this.co++

				var o = {
					id: this.co,
					taskId: tasks[k].id,
					city: tasks[k].cities[i],
					rubrics: tasks[k].rubrics,
					title: tasks[k].cities[i].title,
					task_title: tasks[k].name,
					dbname: 'gis_' + tasks[k].id + '_' + tasks[k].cities[i].code,
					count: '-'
				}

				var status = this.getBaseStatus(tasks[k].id, tasks[k].cities[i].code)
				o.finished = status.finished
				o.count = status.count

				res.push(o)
			}
		}

		return res
	}

	getUnfinishedBases() {
		var res = []
		var bases = this.getBases()

		for (var i = 0; i < bases.length; i++) {
			if (!bases[i].finished) {
				res.push(bases[i])
			}
		}

		return res
	}

	getFirstBase() {
		var bases = this.getBases()

		for (var i = 0; i < bases.length; i++) {
			if (!bases[i].finished) {
				this.curIndex = i
				return bases[i]
			}
		}

		return false
	}

	getBaseStatus(taskId, cityCode) {
		var dbDir = dataDir + '/db/gis_' + taskId + '_' + cityCode

		var statusFile = dbDir + '/status.json'
		var indexFile = dbDir + '/index.json'

		var status

		if (fs.existsSync(statusFile)) {
			status = JSON.parse(fs.readFileSync(statusFile))
		} else {
			status = {
				finished: false,
				count: 0,
				pool: []
			}

			//this.saveBaseStatus(taskId, cityCode, status)
		}

		return status
	}


	getBaseIndex(taskId, cityCode) {
		var dbDir = dataDir + '/db/gis_' + taskId + '_' + cityCode
		var indexFile = dbDir + '/index.json'

		if (fs.existsSync(indexFile)) {
			return JSON.parse(fs.readFileSync(indexFile))
		} else {
			return {}
		}
	}


	saveBaseIndex(taskId, cityCode) {
		var dbDir = dataDir + '/db/gis_' + taskId + '_' + cityCode

		fs.writeFileSync(dbDir + '/index.json', JSON.stringify(this.ids))
	}

	getBasePk(taskId, cityCode) {
		var dbDir = dataDir + '/db/gis_' + taskId + '_' + cityCode
		var indexFile = dbDir + '/pk.json'

		if (fs.existsSync(indexFile)) {
			return JSON.parse(fs.readFileSync(indexFile))
		} else {
			return {}
		}
	}


	saveBasePk(taskId, cityCode) {
		var dbDir = dataDir + '/db/gis_' + taskId + '_' + cityCode

		fs.writeFileSync(dbDir + '/pk.json', JSON.stringify(this.pk))
	}



	saveBaseStatus(taskId, cityCode, status) {
		var dbDir = dataDir + '/db/gis_' + taskId + '_' + cityCode
		var statusFile = dbDir + '/status.json'
		delete status.ids
		fs.writeFileSync(statusFile, JSON.stringify(status))
		this.saveBaseIndex(taskId, cityCode)
		this.saveBasePk(taskId, cityCode)
	}

	setBaseFinished(taskId, cityCode) {
		var status = {
			finished: true,
			count: this.co,
			pool: []
		}
		this.saveBaseStatus(taskId, cityCode, status)
	}

	finish() {
		var status = this.getBaseStatus(this.curTaskId, this.curCity.code)
		status.count = this.co
		status.finished = true
		status.pool = []
		this.saveBaseStatus(this.curTaskId, this.curCity.code, status)
	}

	stop() {
		this.started = false
	}

	pause() {
		var status = this.getBaseStatus(this.curTaskId, this.curCity.code)
		status.count = this.co
		status.pool = this.pool
		this.saveBaseStatus(this.curTaskId, this.curCity.code, status)
	}

	setBaseCount(taskId, cityCode) {
		var status = this.getBaseStatus(taskId, cityCode)
		status.count = this.co
		this.saveBaseStatus(taskId, cityCode, status)
	}

	appendTasks(tasks, callback) {
		this.exportIds = []
		var task = tasks.shift()

		if (!task) {
			callback(null)
		} else {
			var status = this.getBaseStatus(task.taskId, task.city.code)
			var rubrics = []

			for (var i = 0; i < task.rubrics.length; i++) {
				if (!status.pool.includes(task.rubrics[i])) {
					rubrics.push(task.rubrics[i])
				}
			}

			this.appendRubrics(task, rubrics, (e) => {
				this.appendTasks(tasks, callback)
			})
		}
	}

	appendRubrics(task, rubrics, callback) {
		var rubric = rubrics.shift()
		if (!rubric) {
			callback(null)
		} else {
			var rubricFile = dataDir + '/db/' + task.dbname + '/' + rubric + '.json'
			fs.readFile(rubricFile, (e, data) => {
				var d = JSON.parse(data)

				this.appendLines(d, (e) => {
					this.appendRubrics(task, rubrics, callback)
				})
			})
		}
	}

	appendLines(d, callback) {
		var arr = d.shift()

		if (!arr) {
			callback(null)
		} else {
			//if (!this.exportIds.includes(arr[0])) {

			//this.exportIds.push(arr[0])
			this.onExport(arr, (line) => {
				fs.appendFile(this.fd, line, (e) => {
					this.emit('msg', this.exportCo)
					this.exportCo++

					this.appendLines(d, callback)
				})
			})

			//} else {

			//this.appendLines(d, callback)
			//}
		}
	}

	export(tasks, fileName, callback) {
		this.exportCo = 1
		fs.open(fileName, 'a', (e, fd) => {
			this.fd = fd
			this.onBeforeExport((header) => {
				fs.appendFile(this.fd, header, (e) => {
					this.appendTasks(tasks, (e) => {
						this.onAfterExport((footer) => {
							fs.appendFile(this.fd, footer, (e) => {
								fs.close(this.fd, (e) => {
									callback(null)
								})
							})
						})
					})
				})
			})
		})
	}

	getKey() {
		return JSON.parse(fs.readFileSync(dataDir + '/key.json'))
	}

	setKey(key, callback) {
		this.getText('https://parselab.org/key/key3.php?key=' + key + '&key_check', (e, r) => {
			if (r != '0') {
				this.licenseKey = key
				fs.writeFileSync(dataDir + '/key.json', JSON.stringify(key))
				callback(r)
			} else {
				callback(false)
			}
		})
	}

	onBeforeExport(callback) {
		var header = `sep=;\n"id";"name";"city_name";"geometry_name";"post_code";"phone";"email";"website";"vkontakte";"instagram";"lon";"lat";"category";"subcategory"\n`
		callback(header)
	}

	onAfterExport(callback) {
		callback('')
	}

	onExport(arr, callback) {
		var line = `"${this.exportCo}";"${arr[1]}";"${arr[2]}";"${arr[3]}";"${arr[4]}";"${arr[5]}";"${arr[7]}";"${arr[8]}";"${arr[9]}";"${arr[10]}";"${arr[11]}";"${arr[12]}";"${arr[13]}";"${arr[14]}"\n`
		if (config.encoding != 'utf-8') line = iconv.encode(line, config.encoding)
		callback(line)
	}
}

module.exports = Parser