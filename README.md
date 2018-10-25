# List App
POC for basic offline PWA.

### Actions
When the applications is offline two actions are 
    creations based on user input:
- **add**: List items that still need to be added.
- **delete**: List items that where removed. 
    Delete actions are only queued for items that where 
    cached from the remote (items that where created offline
    have not been seen by the server yet so can be deleted
    directly).

### Libraries used in client
- https://github.com/jakearchibald/idb (IndexedDb with Promises)