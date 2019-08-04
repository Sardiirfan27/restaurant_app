"use strict";
/**
** Common database helper functions.
**/
class DBHelper {
  // Get restaurants URL:
  static get RESTAURANTS_URL() {
    return appParams.endpoints.restaurants;
  }

  // Get reviews URL:
  static get REVIEWS_URL() {
    return appParams.endpoints.reviews;
  }

  // Get request headers:
  static get REQUEST_HEADERS() {
    const dataheaders = new Headers();
    dataheaders.append("Accept", "application/json; charset=UTF-8");
    dataheaders.append("Content-type", "application/json; charset=UTF-8");
    dataheaders.append("x-apikey", appParams.databaseApiKey);
    dataheaders.append("cache-control", "no-cache");
    return dataheaders;
  }

  // Check if indexed db is supported:
  static get INDEXED_DB_SUPPORT() {
    const indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    const transactions = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction || {READ_WRITE: "readwrite"};
    const keys = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
    if (!(indexedDB) || !(transactions) || !(keys)) {
      return false;
    } else {
      return true;
    }
  }

  // Get IndexDB Store:
  static get AppStore() {
    return new DataStore();
  }
  
  // Fetch data:
  static async fetchData(url) {
    const request = new Request(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'reload',
      credentials:'same-origin',
      headers: DBHelper.REQUEST_HEADERS});
    try {
      const fetchResult = fetch(request);
      const response = await fetchResult;
      const jsonData = await response.json();
      return Promise.resolve(jsonData);
    } catch(error){
      throw Error(error);
    }
  }
  
  // Get data with proper error handling:
  static getData(url, target, callback) {
    DBHelper.fetchData(url, target).then((response)=>{
      const responseData = {target: target};
      if (target === "restaurants" || target === "reviews") {
        let refactorkey = target.substring(0, target.length-1);
        const returnData = DBHelper.refactorData(refactorkey, response);
        responseData.data = returnData;
        DBHelper.updateIndexedDB(responseData, 'GETALL');
      }else{
        const returnData = DBHelper.refactorData(target, [response])[0];
        responseData.data = returnData;
        DBHelper.updateIndexedDB(responseData, 'GET');
      }
      callback(null, responseData.data);
    }).catch((error) => callback(error, null));
  }

  // Refactor fetched data:
  static refactorData(target, data) {
    let returnData = JSON.parse(JSON.stringify(data));
    switch (target) {
      case "restaurant":
        returnData.forEach(item => {
          if (!('is_favorite' in item)) {
            item.is_favorite=false;
          } else {
            item.is_favorite=item.is_favorite.toString()==="true"?true:false;
          }
          if (!('photograph' in item)) {
            item.photograph=item.id.toString();
          }
        });
        return returnData;
        break;
      default:
        return returnData;
        break;
    }
  }

  // Update indexed db:
  static updateIndexedDB(response, method) {
    if (DBHelper.INDEXED_DB_SUPPORT) {
      switch (method) {
        case 'GETALL':
          DBHelper.AppStore.cacheAll(response.target, response.data);
          break;
        case 'DELETE':
          DBHelper.AppStore.deleteOne(response.target + "s", response.data.id);
          break;
        default:
          DBHelper.AppStore.cacheOne(response.target + "s", response.data);
          break;
      }
    }
  }
  
  // Fetch all restaurants:
  static fetchRestaurants(callback) {
    if (DBHelper.INDEXED_DB_SUPPORT) {
      DBHelper.AppStore.getCachedData('restaurants').then(response => {
        if (response.length) {
          callback(null, response);
          callback = () => {}; // don't call callback again from fetch
          }
          DBHelper.getData(DBHelper.RESTAURANTS_URL,'restaurants', callback);
        });
    } else {
      DBHelper.getData(DBHelper.RESTAURANTS_URL,'restaurants', callback);
    }
  }
  
  // Fetch a restaurant by its ID:
  static fetchRestaurantById(id, callback) {
    if (DBHelper.INDEXED_DB_SUPPORT) {
      DBHelper.AppStore.getCachedDataById('restaurants', parseInt(id)).then((response) => {
        if (response.length > 0) {
          callback(null, response[0]);
          callback = () => {}; // don't call callback again from fetch
        }
        DBHelper.getData(DBHelper.RESTAURANTS_URL+`/${id}`,'restaurant', callback);
      });
    }else{
      DBHelper.getData(DBHelper.RESTAURANTS_URL+`/${id}`,'restaurant', callback);
    }
  }

  // Fetch all reviews:
  static fetchReviews(callback) {
    if (DBHelper.INDEXED_DB_SUPPORT) {
      DBHelper.AppStore.getCachedData('reviews').then(response => {
        if (response.length > 0) {
          callback(null, response);
          callback = () => {}; // don't call callback again from fetch
        }
        DBHelper.getData(DBHelper.REVIEWS_URL,'reviews', callback);
      });
    }else{
      DBHelper.getData(DBHelper.REVIEWS_URL,'reviews', callback);
    }
  }
  
  // Fetch reviews of a restaurant:
  static fetchRestaurantReviews(id, callback) {
    if (DBHelper.INDEXED_DB_SUPPORT) {
      DBHelper.AppStore.getCachedDataByIndex('reviews', 'byRestaurant', id).then(response => {
        if (response.length) {
          callback(null, response);
          callback = () => {}; // don't call callback again from fetch
        }
        DBHelper.getData(DBHelper.REVIEWS_URL+`?restaurant_id=`+id,'reviews', callback);
      });
    }else{
      DBHelper.getData(DBHelper.REVIEWS_URL+`?restaurant_id=`+id,'reviews', callback);
    }
  }

  // Fetch restaurants by a cuisine and a neighborhood with proper error handling:
  static fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, callback) {
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        let filteredRestaurants  = restaurants
        if (cuisine !== 'all') { // filter by cuisine
          filteredRestaurants = filteredRestaurants.filter(r => r.cuisine_type == cuisine);
        }
        if (neighborhood !== 'all') { // filter by neighborhood
          filteredRestaurants = filteredRestaurants.filter(r => r.neighborhood == neighborhood);
        }
        callback(null, filteredRestaurants);
      }
    });
  }
  
  // Fetch all parameters from restaurants (neighborhoods, restaurants) with proper error handling:
  static fetchUniqueRestaurantParams(param, callback) {
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Get all parameters from all restaurants based on key
        const params = restaurants.map(restaurant => restaurant[param]);
        // Remove duplicates from parameters
        const uniqueParams = params.filter((v, i) => params.indexOf(v) == i);
        callback(null, uniqueParams);
      }
    });
  }

  // Restaurant page URL:
  static urlForRestaurant(restaurant) {
    return (`restaurant.html?id=${restaurant.id}`);
  }

  // Restaurant image URL:
  static imageUrlForRestaurant(restaurant) {
    let image = restaurant.photograph + '.jpg';
    return (`img/${image}`);
  }

  // Mark restaurant as favorite or unmark it:
  static favoriteHandler(id, favorite) {
    const url = DBHelper.RESTAURANTS_URL + `/${id}/?is_favorite=${favorite}`;
    const request_params = {method: 'PUT'};
    return DBHelper.sendData(url, request_params, "restaurant");
  }

  // Add a new review:
  static postReview(review) {
    const url = DBHelper.REVIEWS_URL;
    const request_params = {
      method: 'POST',
      body: JSON.stringify(review)
    };
    return DBHelper.sendData(url, request_params, "review");
  }

  // Update a review:
  static updateReview(review) {
    let review_id = review.id;
    if (!review_id.toString().startsWith('temp')) {
      review_id = parseInt( review.id);
    }
    const url = DBHelper.REVIEWS_URL+`/${review_id}`;
    const request_params = {
      method: 'PUT',
      body: JSON.stringify(review)
    };
    return DBHelper.sendData(url, request_params, "review");
  }

  // Delete a review:
  static deleteReview(id) {
    if (id.toString().startsWith('temp')) {
      return DBHelper.getTargetId(DBHelper.REVIEWS_URL+`/${id}`, "review").then(id=>{
        DBHelper.deleteExistingRequest({targetId:id, target: "review"});
        const returnData = {
          request_status: "fail",
          target: 'review',
          data : []
        };
        return returnData;
      });
    } else {
      const url = DBHelper.REVIEWS_URL+`/${parseInt(id)}`;
      const request_params = {method: 'DELETE'}
      return DBHelper.sendData(url, request_params, "review");
    }
  }

  // Send data to server:
  static async sendData(url, request_params, target) {
    const headers = DBHelper.REQUEST_HEADERS;
    request_params.mode = "cors";
    request_params.credentials = "same-origin";
    request_params.headers = headers;
    request_params.json = true;
    const request = new Request(url, request_params);
    try {
      const fetchResult = fetch(request);
      const response = await fetchResult;
      const jsonData = await response.json();
      const returnData = {
        request_status: "success",
        target: target,
        data: DBHelper.refactorData(target, [jsonData])[0]
      };
      DBHelper.updateIndexedDB(returnData, request_params.method);
      return Promise.resolve(returnData);
    } catch(error) {
      const failed_request = request_params;
      failed_request.target = target;
      failed_request.url = url;
      failed_request.data = [];
      return DBHelper.handleFailedRequest(failed_request);
    }
  }
    
  // Get target id of failed request:
  static getTargetId(url, target) {
    const splitter = target + "s";
    let url_part = url.split(splitter).pop();
    if (target === "restaurant") {
      url_part = url_part.split("/?is_favorite")[0];
      return Promise.resolve(url_part.substring(1));
    } else {
      if (url_part) {
        return Promise.resolve(url_part.substring(1));
      } else {
        return DBHelper.AppStore.getStoreKeys('failedRequests').then((response) => {
          const nextkey = response.length+1;
          return `temp${nextkey}`;
        });
      }
    }
  }

  // Delete existing request:
  static deleteExistingRequest(newRequest) {
    DBHelper.AppStore.getCachedData('failedRequests').then((response) => {
      if (response.length) {
        const existingRequests = response.filter(response => response.target === newRequest.target && response.targetId === newRequest.targetId);
        if (existingRequests.length) {
          DBHelper.AppStore.deleteOne('failedRequests', existingRequests[0].id);
        }
      }
    });
  }

  // Handle failed requests:
  static handleFailedRequest(failed_request) {
    const returnData = {
      request_status: "fail",
      target: failed_request.target,
      data : failed_request.data
    };
    if (DBHelper.INDEXED_DB_SUPPORT) {
      return DBHelper.getTargetId(failed_request.url, failed_request.target).then(id => {
        const requestToStore = {
          target: failed_request.target,
          url: failed_request.url,
          method: failed_request.method,
          targetId: id
        }
        if ('body' in failed_request) {
          const dataload = JSON.parse(failed_request.body);
          if (!('id' in dataload)) {
            dataload.id = id;
          }
          requestToStore.body = dataload;
          returnData.data = dataload;
        }
        DBHelper.deleteExistingRequest(requestToStore);
        DBHelper.AppStore.cacheOne('failedRequests', requestToStore);
        return Promise.resolve(returnData);
      });
    } else {
      return Promise.resolve(returnData);
    }
  }
  
  // Sort item list by id:
  static sortByID(item_a, item_b, order_type) {
    let sortedData;
    if (order_type==="asc") {
      sortedData =  parseFloat(item_a.id) - parseFloat(item_b.id);
    } else {
      sortedData = parseFloat(item_b.id) - parseFloat(item_a.id);
    }
    return sortedData;
  }

  // Sort data by date:
  static sortByDate(item_a, item_b, order_type, key) {
    let sortedData;
    if(order_type === "asc"){
      sortedData =  parseFloat(new Date(item_a[key]).getTime()) - parseFloat(new Date(item_b[key]).getTime());
    } else {
      sortedData = parseFloat(new Date(item_b[key]).getTime()) - parseFloat(new Date(item_a[key]).getTime());
    }
    return sortedData;
  }

  // Fetch failed requests:
  static fetchFailedRequests() {
    if (DBHelper.INDEXED_DB_SUPPORT) {
      return DBHelper.AppStore.getCachedData('failedRequests');
    }else{
      return Promise.resolve([]);
    }
  }

  // Clear IndexedDB:
  static clearIndexedBD(){
    DBHelper.AppStore.deleteAll('failedRequests');
    DBHelper.AppStore.deleteAll('restaurants');
    DBHelper.AppStore.deleteAll('reviews');
  }
}
