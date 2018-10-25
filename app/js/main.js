if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js')
			.then(registration => {
				console.log(`Service Worker registed! Scope: ${registration.scope}`);
			})
			.catch(err => {
				console.log(`Service Worker registration failed: ${err}`);
			});
	});
}

const cacheContainer = $('#list-root');
const tempContainer = $('#temp-list-root');

function addItem() {
	const description = $('#item-input-text').val();

	// TODO persist to local store

	const headers = new Headers({'Content-Type': 'application/json'});
	let itemId = getNewLocalId();
	const body = JSON.stringify({description: description, localId: itemId});

	return fetch('add', {
		method: 'POST',
		headers: headers,
		body: body
	}).then(function (response) {
		console.log(response)
	}).catch(function (err) {
		console.log('failed here');
		tempContainer.append(createTempItemForId(itemId, description));
		console.log(err);
		idbQueue.set(itemId, {action: 'add', description: description})
	});
}

function deleteItem(itemId) {
	$(`#item-${itemId}`).remove();
	console.log(`Removed element ` + `#item-${itemId}`)
	// TODO remove from local store
	const headers = new Headers({'Content-Type': 'application/json'});
	const body = JSON.stringify({id: itemId});
	return fetch('delete', {
		method: 'POST',
		headers: headers,
		body: body
	}).then().catch((err) => {

	});
}

function deleteTempItem(itemId) {
	$(`#temp-${itemId}`).remove();
	console.log(`Removed element ` + `#temp-${itemId}`)
	// TODO remove from local store
}

function createItemForId(id, description) {
	const el =
		`<div class="list-child" id="item-${id}">
			<div class="text">${description}</div>
			<button class="delete-button" onclick="deleteItem(${id})">X</button>
			</div>`;
	return $.parseHTML(el);
}

function createTempItemForId(localId, description) {
	const el =
		`<div class="list-child temp" id="temp-${localId}">
			<div class="item-text">${description}</div>
			<button class="delete-button" onclick="deleteTempItem(${localId})">X</button>
			</div>`;
	return $.parseHTML(el);
}

// const onlineEvent = new CustomEvent('wasOnline',{detail:data});

function isServerOnline() {
	// if (func === 'undefined') return;
	$.get('/ping', function (data) {
		// console.log('online');
		// //TODO add online event
		//   func('online');
		dispatchEvent(new CustomEvent('wasOnline'))
	}).fail(function () {
		dispatchEvent(new CustomEvent('wasOffline'))
	});
}

function refresh() {
	isServerOnline();
	setTimeout(refresh, 500);
}

refresh();

addEventListener('wasOnline', () => {
	updateServerState('online')
});
addEventListener('wasOffline', () => {
	updateServerState('offline')
});

function updateServerState(state) {
	if (state === 'undefined') return;
	const listRoot = $('#list-root');
	loadContentNetworkFirst()
	if (state === 'online') {
		listRoot.removeClass('offline-version');
		listRoot.addClass('online-version');
	} else if (state === 'offline') {
		listRoot.addClass('offline-version');
		listRoot.removeClass('online-version');
	}
}

/*
 * Network functions
 */

let serverLastModified = 0;
let localLastModified = 0;

// loadContentNetworkFirst();

let haveLoadedOffline = false;

function loadContentNetworkFirst() {

	getServerLastModified().then(newModified => {
		// server was online, update if it was newer
		if (newModified > serverLastModified) {
			serverLastModified = newModified;
			getServerData()
				.then(dataFromNetwork => {
					// console.log(dataFromNetwork);
					updateUI(dataFromNetwork);
					saveItemDataLocally(dataFromNetwork);
					// .then(() => {
					// 	setLastUpdated(new Date());
					// 	messageDataSaved();
					// }).catch(err => {
					// messageSaveError();
					// console.warn(err);
					// });
					haveLoadedOffline = false;
				})
				.catch(err => {
					// this will be called if server went offline between the first and second call
					loadOfflineContent(err);
				});
		}
	}).catch(err => {
		loadOfflineContent(err);
	});

	const loadOfflineContent = (err) =>{
		// console.log('Network requests have failed, this is expected if offline');
		if (haveLoadedOffline) return;
		getLocalItemData()
			.then(offlineData => {
				if (!offlineData.length) {
					console.log('no messages');
					// messageNoData();
				} else {
					console.log('cached messages');
					console.log(offlineData);
					// messageOffline();
					updateUI(offlineData);
					haveLoadedOffline = true;
				}
			});
	}
}

function getServerLastModified() {
	return fetch('lastModified').then(response => {
		if (!response.ok) {
			throw Error(response.statusText);
		}
		return response.json();
	});
}

function getServerData() {
	return fetch('getAll').then(response => {
		if (!response.ok) {
			throw Error(response.statusText);
		}
		return response.json();
	});
}

function updateUI(items) {
	cacheContainer.empty();
	items.forEach(item => {
		const el = createItemForId(item.id, item.description);
		console.log(`current id : ${item.id}`);

		cacheContainer.append(el);
	});
}


// function addItem(description)
// {
// /*
// * TODO
// * Push ADD
// * On success:
// * 	add to item cache
// *	else
// *		add ADD Action item to pending queue
// * */
// }

// function deleteItem(id)
// {
// /*
// * TODO
// * Remove item from item cache
// * Push DELETE
// * On Success
// * 	do nothing
// * Else
// * 	add DELETE Action item to pending queue
// * */
// }


/**
 * Updates local cache of list from server
 */
function saveItemDataLocally(items) {
	idbCache.clear();
	items.forEach(item => idbCache.set(item.id, item.description))
}

/*
 * UI functions
 */

/*
 * Local storage functions
 */

const dbPromise = idb.open('listapp-store', 1, upgradeDB => {
	upgradeDB.createObjectStore('itemcache');
	upgradeDB.createObjectStore('pendingqueue');
});

const idbCache = {
	get(key) {
		return dbPromise.then(db => {
			return db.transaction('itemcache')
				.objectStore('itemcache').get(key);
		});
	},
	set(key, val) {
		return dbPromise.then(db => {
			const tx = db.transaction('itemcache', 'readwrite');
			tx.objectStore('itemcache').put(val, key);
			return tx.complete;
		});
	},
	delete(key) {
		return dbPromise.then(db => {
			const tx = db.transaction('itemcache', 'readwrite');
			tx.objectStore('itemcache').delete(key);
			return tx.complete;
		});
	},
	clear() {
		return dbPromise.then(db => {
			const tx = db.transaction('itemcache', 'readwrite');
			tx.objectStore('itemcache').clear();
			return tx.complete;
		});
	},
	keys() {
		return dbPromise.then(db => {
			const tx = db.transaction('itemcache');
			const keys = [];
			const store = tx.objectStore('itemcache');

			// This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
			// openKeyCursor isn't supported by Safari, so we fall back
			(store.iterateKeyCursor || store.iterateCursor).call(store, cursor => {
				if (!cursor) return;
				keys.push(cursor.key);
				cursor.continue();
			});

			return tx.complete.then(() => keys);
		});
	},
	keyVals() {
		return dbPromise.then(db => {
			const tx = db.transaction('itemcache');
			const keyVals = [];
			const store = tx.objectStore('itemcache');

			// This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
			// openKeyCursor isn't supported by Safari, so we fall back
			(store.iterateCursor).call(store, cursor => {
				if (!cursor) return;
				keyVals.push({id: cursor.key, description: cursor.value});
				cursor.continue();
			});

			return tx.complete.then(() => keyVals);
		});
	}
};

const idbQueue = {
	get(key) {
		return dbPromise.then(db => {
			return db.transaction('pendingqueue')
				.objectStore('pendingqueue').get(key);
		});
	},
	set(key, val) {
		return dbPromise.then(db => {
			const tx = db.transaction('pendingqueue', 'readwrite');
			tx.objectStore('pendingqueue').put(val, key);
			return tx.complete;
		});
	},
	delete(key) {
		return dbPromise.then(db => {
			const tx = db.transaction('pendingqueue', 'readwrite');
			tx.objectStore('pendingqueue').delete(key);
			return tx.complete;
		});
	},
	clear() {
		return dbPromise.then(db => {
			const tx = db.transaction('pendingqueue', 'readwrite');
			tx.objectStore('pendingqueue').clear();
			return tx.complete;
		});
	},
	keys() {
		return dbPromise.then(db => {
			const tx = db.transaction('pendingqueue');
			const keys = [];
			const store = tx.objectStore('pendingqueue');

			// This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
			// openKeyCursor isn't supported by Safari, so we fall back
			(store.iterateKeyCursor || store.iterateCursor).call(store, cursor => {
				if (!cursor) return;
				keys.push(cursor.key);
				cursor.continue();
			});

			return tx.complete.then(() => keys);
		});
	}
};

function getNewLocalId() {
	let _id = localStorage.getItem('currentLocalId');
	if (_id === null) {
		_id = 1;
		localStorage.setItem('currentLocalId', _id);
	} else {
		localStorage.setItem('currentLocalId', parseInt(_id) + 1);
	}
	return _id;
}

function getLocalItemData() {
	return idbCache.keyVals();
}

// function incrementLocalId() {
// 	let _id = localStorage.getItem('currentLocalId');
// 	if (_id === null) {
// 		_id = 1;
// 	} else {
// 		_id++;
// 	}
// 	localStorage.setItem('currentLocalId', _id);
// }