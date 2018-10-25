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
	fs.writeFileSync(dbLocation, dataToSave);
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

const server = app.listen(8082, () => {

	const host = server.address().address;
	const port = server.address().port;

	console.log('App listening at http://%s:%s', host, port);
});