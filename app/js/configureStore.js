/* @flow */

import { applyMiddleware, combineReducers } from 'redux';
import { localStorage, syncStorage } from 'redux-persist-webextension-storage';
import { persistReducer, persistStore } from 'redux-persist';
import { createStore } from 'redux';
import localStorageReducer from './reducers/localStorageReducer';
import logger from 'redux-logger';
import syncStorageReducer from './reducers/syncStorageReducer';
import tempStorageReducer from './reducers/tempStorageReducer';

const localStoragePersistConfig = {
  debug: true,
  key: 'localStorage',
  migrate(state, currentVersion) {
    // The first time this code is run there will be no redux-persist version of the state, and the
    // `currentVersion` will be a bogus -1. In that case, return the full contents of storage to be
    // the initial state.
    if (currentVersion === -1) {
      return new Promise(resolve => {
        // $FlowFixMe `chrome.storage.local.get` accepts `null`, but the types are incorrect.
        chrome.storage.local.get(null, items => {
          resolve(items);
        });
      });
    } else {
      return Promise.resolve(state);
    }
  },
  serialize: false,
  storage: localStorage,
  version: 1,
};

const syncStoragePersistConfig = {
  key: 'syncStorage',
  serialize: false,
  storage: syncStorage,
};

const rootReducer = combineReducers({
  localStorage: persistReducer(localStoragePersistConfig, localStorageReducer),
  syncStorage: persistReducer(syncStoragePersistConfig, syncStorageReducer),
  tempStorage: tempStorageReducer,
});

export default function() {
  // $FlowFixMe
  const store = createStore(rootReducer, applyMiddleware(logger));
  return {
    persistor: persistStore(store),
    store,
  };
}
