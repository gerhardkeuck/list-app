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


var currentId = 5;

function addItem() {
	// const node = document.getElementById('list-root');
	// const element = document.createElement('li');
	// node.appendChild(element)
	const item = createItemForId(currentId);
	currentId++;
	console.log(`current id : ${currentId}`);

	$('#list-root').append(item);

	// TODO persist to local store
}

function addTempItem() {
	// const node = document.getElementById('list-root');
	// const element = document.createElement('li');
	// node.appendChild(element)
	const item = createTempItemForId(currentId);
	currentId++;
	console.log(`current id : ${currentId}`);

	$('#temp-list-root').append(item);

	// TODO persist to local store
}

function deleteItem(itemId) {
	$(`#item-${itemId}`).remove();
	console.log(`Removed element ` + `#item-${itemId}`)
	// TODO remove from local store
}

function deleteTempItem(itemId) {
	$(`#temp-${itemId}`).remove();
	console.log(`Removed element ` + `#temp-${itemId}`)
	// TODO remove from local store
}

function createItemForId(itemId) {
	const val = $('#item-item-text').val();
	const el =
		`<div class="list-child" id="item-${itemId}">
			<div class="text">${val}</div>
			<button class="delete-button" onclick="deleteItem(${itemId})">X</button>
			</div>`;
	return $.parseHTML(el);
}

function createTempItemForId(itemId) {
	const val = $('#item-item-text').val();
	const el =
		`<div class="list-child temp" id="temp-${itemId}">
			<div class="item-text">${val}</div>
			<button class="delete-button" onclick="deleteTempItem(${itemId})">X</button>
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
function updateList() {
	/*
	 *
	 *
 	 */

}

/*
 * Local storage function
 */

const db = createIndexedDB();

function createIndexedDB() {
	if (!('indexedDB' in window)) {
		return null;
	}
	return idb.open('listdb', 1, function (upgradeDb) {
		if (!upgradeDb.objectStoreNames.contains('cacheditems')) {
			const itemsOS = upgradeDb.createObjectStore('cacheditems', {keyPath: 'id'});
		}
	});
}