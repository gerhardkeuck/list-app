'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();

// This serves static files from the specified directory
app.use(express.static(__dirname + '/build'));

app.use(bodyParser.urlencoded(
	{extended: true}
));
app.use(bodyParser.json());

app.get(['/', '/index.html'], (req, res) => {
	res.sendFile(__dirname + '/index.html');
});

app.get('/ping', (req, res) => {
	res.send('online');
});

app.get('/lastModified', (req, res) => {
	doDbRead((db) => {
		const lastModified = db.lastModified;
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify(lastModified));
	});
});

app.post('/add', (req, res) => {
	if (Object.keys(req.body).length === 0) {
		res.sendStatus(400)
	}
	let itemData = req.body;
	console.log(itemData);
	doDbReadWrite((db) => {
		let id = db.lastId + 1;
		db.lastId = id;
		db.lastModified = new Date().getTime();
		let newItem = {id: id, description: itemData.description, localId: itemData.localId};
		console.log(`Adding item: ${JSON.stringify(newItem)}`);
		db.items.push(newItem);
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify(newItem));
	});
});

app.post('/delete', (req, res) => {
	let itemData = req.body;
	console.log(itemData);
	doDbReadWrite((db) => {
		let targetId = itemData.id;
		console.log(`Removing item: ${JSON.stringify(targetId)}`);
		let index = db.items.findIndex(item => item.id === targetId);
		if (index === -1) {
			// not found
			res.sendStatus(404);
		}
		else {
			db.items.splice(index, 1);
			db.lastModified = new Date().getTime();
			res.sendStatus(200);
		}
	});
});

app.get('/getAll', (req, res) => {
	doDbRead((db) => {
		// console.log(db);
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify(db.items));
	})
});

const dbLocation = __dirname + '/server-data/list-data.json';
const db = getDb();
console.log('Loaded db:');
console.log(db);

/**
 * load db from disk.
 * @returns {any}
 */
function getDb() {
	const rawData = fs.readFileSync(dbLocation);
	return JSON.parse(rawData);
}

/**
 * Write db to disk.
 */
function saveDb() {
	let dataToSave = JSON.stringify(db);
	fs.writeFileSync('list-data.json', dataToSave);
}

/**
 * Read data from db in function. Reads from the in-memory version of the db.
 * @param func (data) => void
 */
function doDbRead(func) {
	func(db);
}

/**
 * Read information from db, write changes to db and then write those changes to disk.
 * Ensures that the disk is always updated after information was pushed.
 * @param func (data) => void
 */
function doDbReadWrite(func) {
	func(db);
	saveDb();
}

// function doDbAction(req, res, func) {
// 	let jsonFile = __dirname + '/server-data/list-data.json';
// 	fs.readFile(jsonFile, (err, data) => {
// 		let db = undefined;
// 		if (err) {
// 			// res.sendStatus(500);
// 			// console.log(err);
// 			// return;
// 			db = {
// 				lastModified: 0,
// 				lastId: 0,
// 				items: []
// 			}
// 		} else {
// 			try {
// 				db = JSON.parse(data);
// 			} catch (e) {
// 				console.log('ACCIDENTALLY DELETED EVERYTHING!');
// 				db = {
// 					lastModified: 0,
// 					lastId: 0,
// 					items: []
// 				}
// 			}
// 		}
// 		func(db);
// 		let dbJson = JSON.stringify(db);
//
// 		// lazy, so always write full db, even when only did write (cause POC)
// 		fs.writeFile(jsonFile, dbJson, err => {
// 			if (err) {
// 				console.log(err)
// 			}
// 		});
// 	})
// }

const server = app.listen(8082, () => {

	const host = server.address().address;
	const port = server.address().port;

	console.log('App listening at http://%s:%s', host, port);
});

// TODO load JSON store in mem, and only write when shutting down

// process.stdin.resume();
//
//
// var count = 1;
//
// function exitHandler(options, exitCode) {
// 	if (options.cleanup) {
// 		console.log('clean');
// 		console.log('SAVING JSON store for exitCode ' + exitCode);
// 	}
// 	if (exitCode || exitCode === 0) console.log(exitCode);
// 	if (options.exit) process.exit();
// }
//
// //do something when app is closing
// process.on('exit', exitHandler.bind(null, {cleanup: true}));
//
// //catches ctrl+c event
// process.on('SIGINT', exitHandler.bind(null, {exit: true}));
//
// // catches "kill pid" (for example: nodemon restart)
// process.on('SIGUSR1', exitHandler.bind(null, {exit: true}));
// process.on('SIGUSR2', exitHandler.bind(null, {exit: true}));
//
// //catches uncaught exceptions
// process.on('uncaughtException', exitHandler.bind(null, {exit: true}));