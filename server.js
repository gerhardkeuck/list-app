const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();

// This serves static files from the specified directory
app.use(express.static(__dirname + '/build'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.get(['/', '/index.html'], (req, res) => {
	res.sendFile(__dirname + '/index.html');
});

app.get('/ping', (req, res) => {
	res.send('online');
});

app.get('/lastModified', (req, res) => {
	doDbAction(req, res, (db) => {
		const lastModified = db.lastModified;
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify(lastModified));
	});
});

app.post('/add', (req, res) => {
	let itemData = req.body;
	// console.log(req)
	doDbAction(req, res, (db) => {
		let id = db.lastId + 1;
		db.lastId = id;
		db.lastModified = new Date().getTime();
		let newItem = {id: id, description: itemData.description};
		console.log(`Adding item: ${JSON.stringify(newItem)}`);
		db.items.push(newItem);
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify(newItem));
	});
});

app.post('/delete', (req, res) => {
	let itemData = req.body;
	doDbAction(req, res, (db) => {
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
	doDbAction(req, res, (db) => {
		console.log(db);
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify(db.items));
	})
});


function doDbAction(req, res, func) {
	let jsonFile = __dirname + '/server-data/list-data.json';
	fs.readFile(jsonFile, (err, data) => {
		let db = undefined;
		if (err) {
			// res.sendStatus(500);
			// console.log(err);
			// return;
			db = {
				lastModified: 0,
				lastId: 0,
				items: []
			}
		} else {
			db = JSON.parse(data);
		}
		func(db);
		let dbJson = JSON.stringify(db);

		// lazy, so always write full db, even when only did write (cause POC)
		fs.writeFile(jsonFile, dbJson, err => {
			if (err) {
				console.log(err)
			}
		});
	})
}

const server = app.listen(8082, () => {

	const host = server.address().address;
	const port = server.address().port;

	console.log('App listening at http://%s:%s', host, port);
});
