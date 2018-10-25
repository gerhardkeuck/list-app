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
	const localId = getNewLocalId();
	const item = {description: description, localId: localId};

	// add to temp UI
	const el = createTempItemForId(localId, description);
	tempContainer.append(el);

	// push to server
	pushAdd(item)
		.then((resp) => resp.json())
		.then((response) => {
			$(`#temp-${localId}`).remove();
			const el = createItemForId(response.id, response.description);
			cacheContainer.append(el);
			idbCache.set(response.id, response.description);
		})
		.catch(() => {
			let action = {action: 'add', item: item};
			idbQueue.set('temp' + localId, action);
		});
}

function deleteItem(itemId) {
	$(`#item-${itemId}`).remove();
	console.log(`Removed element ` + `#item-${itemId}`);
	idbCache.delete(itemId);
	pushDelete(itemId)
		.catch(() => {
			let action = {action: 'delete', id: itemId};
			idbQueue.set('cached' + itemId, action);
		});
}

function deleteTempItem(itemId) {
	$(`#temp-${itemId}`).remove();
	console.log(`Removed element ` + `#temp-${itemId}`);
	idbQueue.delete('temp' + itemId);
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


function refresh() {
	queryServerOnline();
	setTimeout(refresh, 500);
}

/**
 * Polls the server to see if it is online.
 */
function queryServerOnline() {
	$.get('/ping', () => {
		dispatchEvent(new CustomEvent('wasOnline'))
	}).fail(function () {
		dispatchEvent(new CustomEvent('wasOffline'))
	});
}

addEventListener('wasOnline', () => {
	updateServerState('online')
});

addEventListener('wasOffline', () => {
	updateServerState('offline')
});

/**
 * Update what the application knows of the server's state
 * @param state = 'online'|'offline'
 */
function updateServerState(state) {
	if (state === 'undefined') return;
	const listRoot = $('#list-root');
	if (state === 'online') {
		listRoot.removeClass('offline-version');
		listRoot.addClass('online-version');
		loadContentNetworkFirst();

	} else if (state === 'offline') {
		listRoot.addClass('offline-version');
		listRoot.removeClass('online-version');
	}
}

/**
 * Only load on application startup.
 */
function loadOfflineContent() {
// load cache UI
	refreshCachedUI()
// load temp UI
	refreshPendingUI()
}


/*
 * Network functions
 */

/**
 * Populate cache UI from the Items Cache.
 */
function refreshCachedUI() {
	getLocalItemData()
		.then(offlineData => {
			if (!offlineData.length) {
				console.log('no messages');
			} else {
				console.log('cached messages');
				updateCacheUI(offlineData);
			}
		});

	function updateCacheUI(items) {
		cacheContainer.empty();
		items.forEach(item => {
			const el = createItemForId(item.id, item.description);
			cacheContainer.append(el);
		});
	}
}

/**
 * Populate the pending ADD UI from the Pending Queue.
 */
function refreshPendingUI() {
	getPendingActions()
		.then(pendingData => {
			if (!pendingData.length) {
				console.log('no pending actions');
			} else {
				console.log('cached actions');
				updateTempUI(pendingData);
			}
		});

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
}


/**
 * Last modification time of server that clients knows off.
 * @type {number}
 */
let serverLastModified = 0;
let localLastModified = 0;

/**
 * Attempt to execute pending actions.
 *
 * Should be called by trigger event.
 */
const pushPendingActions = () => {
	getPendingActions()
		.then((actions) => {
			// TODO if concurrency issue occurs again, consider clearing the whole queue.
			// Add actions to the queue again if they fail.
			if (actions.length === 0) return;
			actions.forEach(keyVal => {
				if (keyVal.val.action === 'add') {
					idbQueue.delete(keyVal.key);
					pushAdd(keyVal.val.item)
						.then((resp) => resp.json())
						.then((response) => {
							// success, remove action
							$(`#temp-${keyVal.val.item.localId}`).remove();
							const el = createItemForId(response.id, response.description);
							cacheContainer.append(el);
							idbCache.set(response.id, response.description);
						})
						.catch(() => {
							// failed to push acton, try next round
							idbQueue.set(keyVal.key, keyVal.val);

						});
				} else if (keyVal.val.action === 'delete') {
					pushDelete(keyVal.val.id)
						.then(() => {
							// success, remove action
							idbQueue.delete(keyVal.key);
							// also remove item from local cache
							idbCache.delete(keyVal.val.id);
						})
						.catch(() => {
							// failed to push acton, try next round
						})
				} else {
					console.log('Ignoring invalid action')
				}

			})
		})
};

function loadContentNetworkFirst() {
	getServerLastModified()
		.then(newModified => {
			// server was online, update if it was newer
			if (newModified > serverLastModified) {
				serverLastModified = newModified;
				getServerData()
					.then(dataFromNetwork => {
						// console.log(dataFromNetwork);
						saveItemDataLocally(dataFromNetwork);
					})
					.catch(err => {
						// this will be called if server went offline between the first and second call
						loadOfflineContent(err);
					})
					.then(() => refreshCachedUI());
			}
		})
		.then(() => {
			if (localLastModified < getLastLocalModify()) {
				pushPendingActions();
			}
		})
		.catch(err => {
			loadOfflineContent(err);
		});
}

function getServerLastModified() {
	return fetch('lastModified')
		.then(response => {
			if (!response.ok) {
				throw Error(response.statusText);
			}
			return response.json();
		});
}

function getServerData() {
	return fetch('getAll')
		.then(response => {
			if (!response.ok) {
				throw Error(response.statusText);
			}
			return response.json();
		});
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

var idbCache = {
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

var idbQueue = {
	get(key) {
		return dbPromise.then(db => {
			return db.transaction('pendingqueue')
				.objectStore('pendingqueue').get(key);
		});
	},
	set(key, val) {
		updateLocalLastModified();
		return dbPromise.then(db => {
			const tx = db.transaction('pendingqueue', 'readwrite');
			tx.objectStore('pendingqueue').put(val, key);
			return tx.complete;
		});
	},
	delete(key) {
		updateLocalLastModified();
		return dbPromise.then(db => {
			const tx = db.transaction('pendingqueue', 'readwrite');
			tx.objectStore('pendingqueue').delete(key);
			return tx.complete;
		});
	},
	clear() {
		updateLocalLastModified();
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
		time = 1;
		localStorage.setItem('localLastModified', 1);
	}
	return time;
}

function updateLocalLastModified() {
	localStorage.setItem('localLastModified', new Date().getTime());
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

// loadContentNetworkFirst();

loadOfflineContent();

refresh();
