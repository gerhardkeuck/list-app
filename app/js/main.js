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
	let itemId = getNewLocalId();
	let item = {description: description, localId: itemId};

	return pushAdd(item).then(function (response) {
		console.log(response)
	}).catch(function (err) {
		console.log('Server offline. Adding pending ADD action');
		let action = {action: 'add', item: item};
		console.log(action);
		idbQueue.set('temp' + itemId, action)
	}).then(() => updateLastLocalModify());
}

function pushAdd(item) {
	const body = JSON.stringify(item);
	const headers = new Headers({'Content-Type': 'application/json'});
	return fetch('add', {
		method: 'POST',
		headers: headers,
		body: body
	})
}

function pushDelete(remoteId) {
	const body = JSON.stringify({id: remoteId});
	const headers = new Headers({'Content-Type': 'application/json'});
	return fetch('delete', {
		method: 'POST',
		headers: headers,
		body: body
	})
}

function deleteItem(itemId) {
	$(`#item-${itemId}`).remove();
	console.log(`Removed element ` + `#item-${itemId}`)
	return pushDelete(itemId).catch((err) => {
		// network failure, add DELETE action to queue
		console.log(err);
		let action = {action: 'delete', id: itemId};
		idbQueue.set('cached' + itemId, action)
	}).then(() => updateLastLocalModify());
}

function deleteTempItem(itemId) {
	$(`#temp-${itemId}`).remove();
	console.log(`Removed element ` + `#temp-${itemId}`)
// delete directly as item has not been pushed to server yet
	idbQueue.delete('temp' + itemId);
	updateLastLocalModify();
}

// const onlineEvent = new CustomEvent('wasOnline',{detail:data});

/**
 * Polls the server to see if it is online.
 */
function isServerOnline() {
	$.get('/ping', function (data) {
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
let haveLoadedPending = false;

function loadContentNetworkFirst() {
	getServerLastModified().then(newModified => {
		// server was online, update if it was newer
		if (newModified > serverLastModified) {
			serverLastModified = newModified;
			getServerData()
				.then(dataFromNetwork => {
					// console.log(dataFromNetwork);
					updateCacheUI(dataFromNetwork);
					saveItemDataLocally(dataFromNetwork);
					haveLoadedOffline = false;
				})
				.catch(err => {
					// this will be called if server went offline between the first and second call
					loadOfflineContent(err);
				});
		}
	}).then(() => pushPendingActions()
	).catch(err => {
		loadOfflineContent(err);
	}).then(() => loadPendingActions());

	const pushPendingActions = () => {
		//TODO push pending actions to server
		getPendingActions().then((actions) => {
			if (actions.length === 0) return;
			actions.forEach(keyVal => {
				if (keyVal.val.action === 'add') {
					pushAdd(keyVal.val.item).then(() => {
						// success, remove action
						idbQueue.delete(keyVal.key)
					}).catch(() => {
						// failed to push acton, try next round
					})
				} else if (keyVal.val.action === 'delete') {
					pushDelete(keyVal.val.id)
						.then(() => {
							// success, remove action
							idbQueue.delete(keyVal.key)
						}).catch(() => {
						// failed to push acton, try next round
					})
				} else {
					console.log('Ignoring invalid action')
				}

			})
		})
	};

	const loadPendingActions = () => {
		if (haveLoadedPending) return;
		getPendingActions()
			.then(pendingData => {
				if (!pendingData.length) {
					console.log('no pending actions');
				} else {
					console.log('cached actions');
					console.log(pendingData);
					updateTempUI(pendingData);
					haveLoadedOffline = true;
				}
			})
			.then(() => {
				haveLoadedPending = true;
			})
	};

	const loadOfflineContent = (err) => {
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
					updateCacheUI(offlineData);
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

function updateCacheUI(items) {
	cacheContainer.empty();
	items.forEach(item => {
		const el = createItemForId(item.id, item.description);
		cacheContainer.append(el);
	});
}

/**
 * Populate the pending list from the pending actions.
 * @param items
 */
function updateTempUI(items) {
	tempContainer.empty();
	items.forEach(item => {
		if (item.val.action === 'add') {
			const el = createTempItemForId(item.val.item.localId, item.val.item.description);
			tempContainer.append(el);
		} else {
			console.log(`skipping item with action ${item.val.action}`)
		}
	})
}

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
	keyVals() {
		return dbPromise.then(db => {
			const tx = db.transaction('pendingqueue');
			const keyVals = [];
			const store = tx.objectStore('pendingqueue');

			// This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
			// openKeyCursor isn't supported by Safari, so we fall back
			(store.iterateCursor).call(store, cursor => {
				if (!cursor) return;
				keyVals.push({key: cursor.key, val: cursor.value});
				cursor.continue();
			});

			return tx.complete.then(() => keyVals);
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

function getLastLocalModify() {
	let time = localStorage.getItem('localLastModified');
	if (time === null) {
		time = -1;
		localStorage.setItem('localLastModified', time);
	}
	return time;
}

function updateLastLocalModify() {
	localStorage.setItem('localLastModified', new Date().getTime());
	haveLoadedPending = false;
}

function getLocalItemData() {
	return idbCache.keyVals();
}

function getPendingActions() {
	return idbQueue.keyVals();
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