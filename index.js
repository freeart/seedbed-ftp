const Client = require('ftp'),
	async = require('async'),
	path = require('path'),
	fs = require('fs')

function parseFilename(filename) {
	const regex = /-(\d*)-(Full|Incremental)/gm;
	let m;
	const result = {
		name: filename
	};

	while ((m = regex.exec(filename)) !== null) {
		if (m.index === regex.lastIndex) {
			regex.lastIndex++;
		}
		result.index = parseInt(m[1], 10)
		result.type = m[2].toUpperCase() == 'FULL' ? 0 : 1
	}
	return result
}

class FTP {
	constructor(classifier, options) {
		this.classifier = classifier
		this.options = options
		this.client = new Client()
	}

	sync(cb) {
		this.client.on('ready', (err) => {
			if (err) {
				return cb(err)
			}
			this.copy(cb)
		})
		this.client.connect(this.options)
	}

	copy(cb) {
		this.client.list(this.classifier, (err, list) => {
			if (err) {
				return cb(err)
			}
			const orderedList = list.map((file) => {
				return parseFilename(file.name)
			}).sort((a, b) => {
				let aSize = a.type;
				let bSize = b.type;
				let aLow = a.index;
				let bLow = b.index;
				if (aSize == bSize) {
					return (aLow < bLow) ? -1 : (aLow > bLow) ? 1 : 0;
				} else {
					return (aSize < bSize) ? -1 : 1;
				}
			})
			const copiedFiles = {
				full: [],
				incremental: []
			}
			async.eachLimit(orderedList, 1, (file, cb) => {
				if (fs.existsSync(path.join('.', 'public', file.name))) {
					return setImmediate(cb)
				}
				this.client.get(`${this.classifier}/` + file.name, (err, stream) => {
					if (err) {
						return cb(err)
					}
					stream.once('close', () => {
						if (file.name.indexOf('-Full.xml') != -1) {
							copiedFiles.full.push(file.name)
						}
						if (file.name.indexOf('-Incremental.xml') != -1) {
							copiedFiles.incremental.push(file.name)
						}
						cb(null)
					})
					stream.pipe(fs.createWriteStream(path.join('.', 'public', file.name)));
				});
			}, (err) => {
				this.client.end()
				cb(err, copiedFiles)
			})
		})
	}
}

module.exports = function () {
	this.ftp = new FTP(this.config.get("project.classifier"), this.config.get('ftp'))
	return Promise.resolve()
}