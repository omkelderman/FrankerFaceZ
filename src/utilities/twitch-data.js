'use strict';

// ============================================================================
// Twitch Data
// Get data, from Twitch.
// ============================================================================

import Module from 'utilities/module';
import {get, debounce} from 'utilities/object';

const LANGUAGE_MATCHER = /^auto___lang_(\w+)$/;

/**
 * PaginatedResult
 *
 * @typedef {Object} PaginatedResult
 * @property {String} cursor A cursor usable to fetch the next page of results
 * @property {Object[]} items This page of results
 * @property {Boolean} finished Whether or not we have reached the end of results.
 */

/**
 * TwitchData is a container for getting different types of Twitch data
 * @class TwitchData
 * @extends Module
 */
export default class TwitchData extends Module {
	constructor(...args) {
		super(...args);

		this.site = this.parent;

		this.inject('site.apollo');

		this._waiting_user_ids = new Map;
		this._waiting_user_logins = new Map;

		this._waiting_stream_ids = new Map;
		this._waiting_stream_logins = new Map;

		this.tag_cache = new Map;
		this._waiting_tags = new Map;

		this._loadTags = debounce(this._loadTags, 50);
		this._loadStreams = debounce(this._loadStreams, 50);
	}

	queryApollo(query, variables, options) {
		let thing;
		if ( ! variables && ! options && query.query )
			thing = query;
		else {
			thing = {
				query,
				variables
			};

			if ( options )
				thing = Object.assign(thing, options);
		}

		return this.apollo.client.query(thing);
	}

	mutate(mutation, variables, options) {
		let thing;
		if ( ! variables && ! options && mutation.mutation )
			thing = mutation;
		else {
			thing = {
				mutation,
				variables
			};

			if ( options )
				thing = Object.assign(thing, options);
		}

		return this.apollo.client.mutate(thing);
	}

	get languageCode() {
		const session = this.site.getSession();
		return session && session.languageCode || 'en'
	}

	get locale() {
		const session = this.site.getSession();
		return session && session.locale || 'en-US'
	}


	// ========================================================================
	// Badges
	// ========================================================================

	async getBadges() {
		const data = await this.queryApollo(
			await import(/* webpackChunkName: 'queries' */ './data/global-badges.gql')
		);

		return get('data.badges', data);
	}


	// ========================================================================
	// Categories
	// ========================================================================

	/**
	 * Find categories matching the search query
	 *
	 * @param {String} query The category name to match
	 * @param {Number} [first=15] How many results to return
	 * @param {String} [cursor=null] A cursor, to be used in fetching the
	 * next page of results.
	 * @returns {PaginatedResult} The results
	 */
	async getMatchingCategories(query, first = 15, cursor = null) {
		const data = await this.queryApollo(
			await import(/* webpackChunkName: 'queries' */ './data/search-category.gql'),
			{
				query,
				first,
				cursor
			}
		);

		const items = get('data.searchCategories.edges.@each.node', data) ?? [],
			needle = query.toLowerCase();

		if ( Array.isArray(items) )
			items.sort((a,b) => {
				const a_match = a && (a.name?.toLowerCase?.() === needle || a?.displayName?.toLowerCase?.() === needle),
					b_match = a && (b.name?.toLowerCase?.() === needle || b?.displayName?.toLowerCase?.() === needle);

				if ( a_match && ! b_match ) return -1;
				if ( ! a_match && b_match ) return 1;
				return 0;
			});

		return {
			cursor: get('data.searchCategories.edges.@last.cursor', data),
			items,
			finished: ! get('data.searchCategories.pageInfo.hasNextPage', data),
			count: get('data.searchCategories.totalCount', data) || 0
		};
	}

	/**
	 * Queries Apollo for category details given the id or name. One of (id, name) MUST be specified
	 * @function getCategory
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string|null|undefined} id - the category id number (can be an integer string)
	 * @param {string|null|undefined} name - the category name
	 * @returns {Object} information about the requested stream
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.getCategory(null, 'Just Chatting'));
	 */
	async getCategory(id, name) {
		const data = await this.queryApollo(
			await import(/* webpackChunkName: 'queries' */ './data/category-fetch.gql'),
			{ id, name }
		);

		return get('data.game', data);
	}


	// ========================================================================
	// Users
	// ========================================================================

	/**
	 * Find users matching the search query.
	 *
	 * @param {String} query Text to match in the login or display name
	 * @param {Number} [first=15] How many results to return
	 * @param {String} [cursor=null] A cursor, to be used in fetching the next
	 * page of results.
	 * @returns {PaginatedResult} The results
	 */
	async getMatchingUsers(query, first = 15, cursor = null) {
		const data = await this.queryApollo(
			await import(/* webpackChunkName: 'queries' */ './data/search-user.gql'),
			{
				query,
				first,
				cursor
			}
		);

		const items = get('data.searchUsers.edges.@each.node', data) ?? [],
			needle = query.toLowerCase();

		if ( Array.isArray(items) )
			items.sort((a,b) => {
				const a_match = a && (a.login?.toLowerCase?.() === needle || a?.displayName?.toLowerCase?.() === needle),
					b_match = a && (b.login?.toLowerCase?.() === needle || b?.displayName?.toLowerCase?.() === needle);

				if ( a_match && ! b_match ) return -1;
				if ( ! a_match && b_match ) return 1;
				return 0;
			});

		return {
			cursor: get('data.searchUsers.edges.@last.cursor', data),
			items,
			finished: ! get('data.searchUsers.pageInfo.hasNextPage', data),
			count: get('data.searchUsers.totalCount', data) || 0
		};
	}

	/**
	 * Queries Apollo for user details given the id or name. One of (id, login) MUST be specified
	 * @function getUser
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string|null|undefined} id - the user id number (can be an integer string)
	 * @param {string|null|undefined} login - the username
	 * @returns {Object} information about the requested user
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.getUser(19571641, null));
	 */
	async getUser(id, login) {
		const data = await this.queryApollo(
			await import(/* webpackChunkName: 'queries' */ './data/user-fetch.gql'),
			{ id, login }
		);

		return get('data.user', data);
	}

	/**
	 * Queries Apollo for the user's current game, details given the user id or name. One of (id, login) MUST be specified
	 * @function getUserGame
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string|null|undefined} id - the user id number (can be an integer string)
	 * @param {string|null|undefined} login - the username
	 * @returns {Object} information about the requested user
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.getUserGame(19571641, null));
	 */
	async getUserGame(id, login) {
		const data = await this.queryApollo(
			await import(/* webpackChunkName: 'queries' */ './data/user-game.gql'),
			{ id, login }
		);

		return get('data.user.broadcastSettings.game', data);
	}

	/**
	 * Queries Apollo for the logged in user's relationship to the channel with given the id or name. One of (id, login) MUST be specified
	 * @function getUserSelf
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string|null|undefined} id - the channel id number (can be an integer string)
	 * @param {string|null|undefined} login - the channel username
	 * @returns {Object} information about your status in the channel
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.getUserSelf(null, "ninja"));
	 */
	async getUserSelf(id, login) {
		const data = await this.queryApollo(
			await import(/* webpackChunkName: 'queries' */ './data/user-self.gql'),
			{ id, login }
		);

		return get('data.user.self', data);
	}


	async getUserFollowed(id, login) {
		const data = await this.queryApollo(
			await import(/* webpackChunkName: 'queries' */ './data/user-followed.gql'),
			{ id, login }
		);

		return get('data.user.self.follower', data);
	}


	async followUser(channel_id, disable_notifications = false) {
		channel_id = String(channel_id);
		disable_notifications = !! disable_notifications;

		const data = await this.mutate({
			mutation: await import(/* webpackChunkName: 'queries' */ './data/follow-user.gql'),
			variables: {
				input: {
					targetID: channel_id,
					disableNotifications: disable_notifications
				}
			}
		});

		console.log('result', data);
		const err = get('data.followUser.error', data);
		if ( err?.code )
			throw new Error(err.code);

		return get('data.followUser.follow', data);
	}


	async unfollowUser(channel_id, disable_notifications = false) {
		channel_id = String(channel_id);
		disable_notifications = !! disable_notifications;

		const data = await this.mutate({
			mutation: await import(/* webpackChunkName: 'queries' */ './data/unfollow-user.gql'),
			variables: {
				input: {
					targetID: channel_id
				}
			}
		});

		console.log('result', data);
		return get('data.unfollowUser.follow', data);
	}


	/**
	 * Queries Apollo for the requested user's latest broadcast. One of (id, login) MUST be specified
	 * @function getLastBroadcast
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string|null|undefined} id - the channel id number (can be an integer string)
	 * @param {string|null|undefined} login - the channel username
	 * @returns {Object} information about the requested user's latest broadcast
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.getLastBroadcast(19571641, null));
	 */
	async getLastBroadcast(id, login) {
		const data = await this.queryApollo(
			await import(/* webpackChunkName: 'queries' */ './data/last-broadcast.gql'),
			{ id, login }
		);

		return get('data.user.lastBroadcast', data);
	}


	/**
	 * Fetch basic information on a user from Twitch. This is automatically batched
	 * for performance, but not directly cached. Either an id or login must be provided.
	 *
	 * @param {Number|String} [id] The ID of the channel
	 * @param {String} [login] The username of the channel
	 *
	 * @returns {Promise} A basic user object.
	 */
	getUserBasic(id, login) {
		return new Promise((s, f) => {
			if ( id ) {
				if ( this._waiting_user_ids.has(id) )
					this._waiting_user_ids.get(id).push([s,f]);
				else
					this._waiting_user_ids.set(id, [[s,f]]);
			} else if ( login ) {
				if ( this._waiting_user_logins.has(login) )
					this._waiting_user_logins.get(login).push([s,f]);
				else
					this._waiting_user_logins.set(login, [[s,f]]);
			} else
				f('id and login cannot both be null');

			if ( ! this._loading_users )
				this._loadUsers();
		})
	}

	async _loadUsers() {
		if ( this._loading_users )
			return;

		this._loading_users = true;

		// Get the first 50... things.
		const ids = [...this._waiting_user_ids.keys()].slice(0, 50),
			remaining = 50 - ids.length,
			logins = remaining > 0 ? [...this._waiting_user_logins.keys()].slice(0, remaining) : [];

		let nodes;

		try {
			const data = await this.queryApollo({
				query: await import(/* webpackChunkName: 'queries' */ './data/user-bulk.gql'),
				variables: {
					ids: ids.length ? ids : null,
					logins: logins.length ? logins : null
				}
			});

			nodes = get('data.users', data);

		} catch(err) {
			for(const id of ids) {
				const promises = this._waiting_user_ids.get(id);
				this._waiting_user_ids.delete(id);

				for(const pair of promises)
					pair[1](err);
			}

			for(const login of logins) {
				const promises = this._waiting_user_logins.get(login);
				this._waiting_user_logins.delete(login);

				for(const pair of promises)
					pair[1](err);
			}

			return;
		}

		const id_set = new Set(ids),
			login_set = new Set(logins);

		if ( Array.isArray(nodes) )
			for(const node of nodes) {
				if ( ! node || ! node.id )
					continue;

				id_set.delete(node.id);
				login_set.delete(node.login);

				let promises = this._waiting_user_ids.get(node.id);
				if ( promises ) {
					this._waiting_user_ids.delete(node.id);
					for(const pair of promises)
						pair[0](node);
				}

				promises = this._waiting_user_logins.get(node.login);
				if ( promises ) {
					this._waiting_user_logins.delete(node.login);
					for(const pair of promises)
						pair[0](node);
				}
			}

		for(const id of id_set) {
			const promises = this._waiting_user_ids.get(id);
			if ( promises ) {
				this._waiting_user_ids.delete(id);
				for(const pair of promises)
					pair[0](null);
			}
		}

		for(const login of login_set) {
			const promises = this._waiting_user_logins.get(login);
			if ( promises ) {
				this._waiting_user_logins.delete(login);
				for(const pair of promises)
					pair[0](null);
			}
		}

		this._loading_users = false;

		if ( this._waiting_user_ids.size || this._waiting_user_logins.size )
			this._loadUsers();
	}


	// ========================================================================
	// Broadcast ID
	// ========================================================================

	/**
	 * Queries Apollo for the ID of the specified user's current broadcast. This ID will become the VOD ID. One of (id, login) MUST be specified
	 * @function getBroadcastID
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string|null|undefined} id - the channel id number (can be an integer string)
	 * @param {string|null|undefined} login - the channel username
	 * @returns {Object} information about the current broadcast
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.getBroadcastID(null, "ninja"));
	 */
	async getBroadcastID(id, login) {
		const data = await this.queryApollo({
			query: await import(/* webpackChunkName: 'queries' */ './data/broadcast-id.gql'),
			variables: {
				id,
				login
			}
		});

		return get('data.user.stream.archiveVideo.id', data);
	}


	async getChannelColor(id, login) {
		const data = await this.queryApollo({
			query: await import(/* webpackChunkName: 'queries' */ './data/user-color.gql'),
			variables: {
				id,
				login
			}
		});

		return get('data.user.primaryColorHex', data);
	}


	// ========================================================================
	// Polls
	// ========================================================================

	/**
	 * Queries Apollo for information about the specified poll.
	 * @function getPoll
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string} poll_id - the poll id number (can be an integer string)
	 * @returns {Object} information about the specified poll
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.getPoll(1337));
	 */
	async getPoll(poll_id) {
		const data = await this.queryApollo({
			query: await import(/* webpackChunkName: 'queries' */ './data/poll-get.gql'),
			variables: {
				id: poll_id
			}
		});

		return get('data.poll', data);
	}

	/**
	 * Create a new poll
	 * @function createPoll
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string} channel_id - the channel id number (can be an integer string)
	 * @param {string} title - the poll title
	 * @param {string[]} choices - an array of poll choices
	 * @param {Object} [options] - an object containing poll options
	 * @param {int} [options.bits=0] - how many bits it costs to vote
	 * @param {int} [options.duration=60] - how long the poll will be held for, in seconds
	 * @param {bool} [options.subscriberMultiplier=false] - whether to activate subsriber 2x multiplier
	 * @param {bool} [options.subscriberOnly=false] - whether only subscribers may vote
	 * @returns {Object} poll data
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.createPoll(19571641, "Pick an option:", ["One", "Two", "Three"], {bits: 10, duration: 120, subscriberMultiplier: false, subscriberOnly: true}));
	 */
	async createPoll(channel_id, title, choices, options = {}) {
		if ( typeof title !== 'string' )
			throw new TypeError('title must be string');

		if ( ! Array.isArray(choices) || choices.some(x => typeof x !== 'string') )
			throw new TypeError('choices must be array of strings');

		let bits = options.bits || 0,
			duration = options.duration || 60;
		if ( typeof bits !== 'number' || bits < 0 )
			bits = 0;
		if ( typeof duration !== 'number' || duration < 0 )
			duration = 60;

		const data = await this.mutate({
			mutation: await import(/* webpackChunkName: 'queries' */ './data/poll-create.gql'),
			variables: {
				input: {
					bitsCost: bits,
					bitsVoting: bits > 0,
					choices: choices.map(x => ({title: x})),
					durationSeconds: duration,
					ownedBy: `${channel_id}`,
					subscriberMultiplier: options.subscriberMultiplier || false,
					subscriberOnly: options.subscriberOnly || false,
					title
				}
			}
		});

		return get('data.createPoll.poll', data);
	}

	/**
	 * Place specified poll into archive
	 * @function archivePoll
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string|null|undefined} poll_id - the poll id number (can be an integer string)
	 * @returns {Object} information about the specified poll
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.archivePoll(1337));
	 */
	async archivePoll(poll_id) {
		const data = await this.mutate({
			mutation: await import(/* webpackChunkName: 'queries' */ './data/poll-archive.gql'),
			variables: {
				id: poll_id
			}
		});

		return get('data.archivePoll.poll', data);
	}

	/**
	 * Terminate specified poll
	 * @function terminatePoll
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string|null|undefined} poll_id - the poll id number (can be an integer string)
	 * @returns {Object} information about the specified poll
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.archivePoll(1337));
	 */
	async terminatePoll(poll_id) {
		const data = await this.mutate({
			mutation: await import(/* webpackChunkName: 'queries' */ './data/poll-terminate.gql'),
			variables: {
				id: poll_id
			}
		});

		return get('data.terminatePoll.poll', data);
	}


	// ========================================================================
	// Stream Up-Type (Uptime and Type, for Directory Purposes)
	// ========================================================================

	/**
	 * Queries Apollo for stream metadata. One of (id, login) MUST be specified
	 * @function getStreamMeta
	 * @memberof TwitchData
	 *
	 * @param {int|string|null|undefined} id - the channel id number (can be an integer string)
	 * @param {string|null|undefined} login - the channel name
	 * @returns {Promise} information about the requested stream
	 *
	 * @example
	 *
	 *  this.twitch_data.getStreamMeta(19571641, null).then(function(returnObj){console.log(returnObj);});
	 */
	getStreamMeta(id, login) {
		return new Promise((s, f) => {
			if ( id ) {
				if ( this._waiting_stream_ids.has(id) )
					this._waiting_stream_ids.get(id).push([s, f]);
				else
					this._waiting_stream_ids.set(id, [[s, f]]);
			} else if ( login ) {
				if ( this._waiting_stream_logins.has(login) )
					this._waiting_stream_logins.get(login).push([s, f]);
				else
					this._waiting_stream_logins.set(login, [[s, f]]);
			} else
				f('id and login cannot both be null');

			if ( ! this._loading_streams )
				this._loadStreams();
		})
	}

	async _loadStreams() {
		if ( this._loading_streams )
			return;

		this._loading_streams = true;

		// Get the first 50... things.
		const ids = [...this._waiting_stream_ids.keys()].slice(0, 50),
			remaining = 50 - ids.length,
			logins = remaining > 0 ? [...this._waiting_stream_logins.keys()].slice(0, remaining) : [];

		let nodes;

		try {
			const data = await this.queryApollo({
				query: await import(/* webpackChunkName: 'queries' */ './data/stream-fetch.gql'),
				variables: {
					ids: ids.length ? ids : null,
					logins: logins.length ? logins : null
				}
			});

			nodes = get('data.users', data);

		} catch(err) {
			for(const id of ids) {
				const promises = this._waiting_stream_ids.get(id);
				this._waiting_stream_ids.delete(id);

				for(const pair of promises)
					pair[1](err);
			}

			for(const login of logins) {
				const promises = this._waiting_stream_logins.get(login);
				this._waiting_stream_logins.delete(login);

				for(const pair of promises)
					pair[1](err);
			}

			return;
		}

		const id_set = new Set(ids),
			login_set = new Set(logins);

		if ( Array.isArray(nodes) )
			for(const node of nodes) {
				if ( ! node || ! node.id )
					continue;

				id_set.delete(node.id);
				login_set.delete(node.login);

				let promises = this._waiting_stream_ids.get(node.id);
				if ( promises ) {
					this._waiting_stream_ids.delete(node.id);
					for(const pair of promises)
						pair[0](node.stream);
				}

				promises = this._waiting_stream_logins.get(node.login);
				if ( promises ) {
					this._waiting_stream_logins.delete(node.login);
					for(const pair of promises)
						pair[0](node.stream);
				}
			}

		for(const id of id_set) {
			const promises = this._waiting_stream_ids.get(id);
			if ( promises ) {
				this._waiting_stream_ids.delete(id);
				for(const pair of promises)
					pair[0](null);
			}
		}

		for(const login of login_set) {
			const promises = this._waiting_stream_logins.get(login);
			if ( promises ) {
				this._waiting_stream_logins.delete(login);
				for(const pair of promises)
					pair[0](null);
			}
		}

		this._loading_streams = false;

		if ( this._waiting_stream_ids.size || this._waiting_stream_logins.size )
			this._loadStreams();
	}


	// ========================================================================
	// Tags
	// ========================================================================

	memorizeTag(node, dispatch = true) {
		// We want properly formed tags.
		if ( ! node || ! node.id || ! node.tagName || ! node.localizedName )
			return;

		let tag = this.tag_cache.get(node.id);
		if ( ! tag ) {
			const match = node.isLanguageTag && LANGUAGE_MATCHER.exec(node.tagName),
				lang = match && match[1] || null;

			tag = {
				id: node.id,
				value: node.id,
				is_auto: node.isAutomated,
				is_language: node.isLanguageTag,
				language: lang,
				name: node.tagName,
				scope: node.scope
			};

			this.tag_cache.set(node.id, tag);
		}

		if ( node.localizedName )
			tag.label = node.localizedName;
		if ( node.localizedDescription )
			tag.description = node.localizedDescription;

		if ( dispatch && tag.description && this._waiting_tags.has(tag.id) ) {
			const promises = this._waiting_tags.get(tag.id);
			this._waiting_tags.delete(tag.id);
			for(const pair of promises)
				pair[0](tag);
		}

		return tag;
	}

	async _loadTags() {
		if ( this._loading_tags )
			return;

		this._loading_tags = true;

		// Get the first 50 tags.
		const ids = [...this._waiting_tags.keys()].slice(0, 50);

		let nodes

		try {
			const data = await this.queryApollo(
				await import(/* webpackChunkName: 'queries' */ './data/tags-fetch.gql'),
				{
					ids
				}
			);

			nodes = get('data.contentTags', data);

		} catch(err) {
			for(const id of ids) {
				const promises = this._waiting_tags.get(id);
				this._waiting_tags.delete(id);

				for(const pair of promises)
					pair[1](err);
			}

			return;
		}

		const id_set = new Set(ids);

		if ( Array.isArray(nodes) )
			for(const node of nodes) {
				const tag = this.memorizeTag(node, false),
					promises = this._waiting_tags.get(tag.id);

				this._waiting_tags.delete(tag.id);
				id_set.delete(tag.id);

				if ( promises )
					for(const pair of promises)
						pair[0](tag);
			}

		for(const id of id_set) {
			const promises = this._waiting_tags.get(id);
			this._waiting_tags.delete(id);

			for(const pair of promises)
				pair[0](null);
		}

		this._loading_tags = false;

		if ( this._waiting_tags.size )
			this._loadTags();
	}

	/**
	 * Queries Apollo for tag information
	 * @function getTag
	 * @memberof TwitchData
	 *
	 * @param {int|string} id - the tag id
	 * @param {bool} [want_description=false] - whether the description is also required
	 * @returns {Promise} tag information
	 *
	 * @example
	 *
	 *  this.twitch_data.getTag(50).then(function(returnObj){console.log(returnObj);});
	 */
	getTag(id, want_description = false) {
		// Make sure we weren't accidentally handed a tag object.
		if ( id && id.id )
			id = id.id;

		if ( this.tag_cache.has(id) ) {
			const out = this.tag_cache.get(id);
			if ( out && (out.description || ! want_description) )
				return Promise.resolve(out);
		}

		return new Promise((s, f) => {
			if ( this._waiting_tags.has(id) )
				this._waiting_tags.get(id).push([s, f]);
			else {
				this._waiting_tags.set(id, [[s, f]]);
				if ( ! this._loading_tags )
					this._loadTags();
			}
		});
	}

	/**
	 * Queries the tag cache for tag information, queries Apollo on cache miss
	 * @function getTagImmediate
	 * @memberof TwitchData
	 *
	 * @param {int|string} id - the tag id
	 * @param {getTagImmediateCallback} callback - callback function for use when requested tag information is not cached
	 * @param {bool} [want_description=false] - whether the tag description is required
	 * @returns {Object|null} tag information object, or on null, expect callback
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.getTagImmediate(50));
	 */
	getTagImmediate(id, callback, want_description = false) {
		// Make sure we weren't accidentally handed a tag object.
		if ( id && id.id )
			id = id.id;

		let out = null;
		if ( this.tag_cache.has(id) )
			out = this.tag_cache.get(id);

		if ( (want_description && (! out || ! out.description)) || (! out && callback) ) {
			const promise = this.getTag(id, want_description);
			if ( callback )
				promise.then(tag => callback(id, tag)).catch(err => callback(id, null, err));
		}

		return out;
	}

	/**
	 * Callback function used when getTagImmediate experiences a cache miss
	 * @callback getTagImmediateCallback
	 * @param {int} tag_id - The tag ID number
	 * @param {Object} tag_object - the object containing tag data
	 * @param {Object} [error_object] - returned error information on tag data fetch failure
	 */

	/**
	 * Get top [n] tags
	 * @function getTopTags
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {int|string} limit=50 - the number of tags to return (can be an integer string)
	 * @returns {string[]} an array containing the top tags up to the limit requested
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.getTopTags(20));
	 */
	async getTopTags(limit = 50) {
		const data = await this.queryApollo(
			await import(/* webpackChunkName: 'queries' */ './data/tags-top.gql'),
			{limit}
		);

		const nodes = get('data.topTags', data);
		if ( ! Array.isArray(nodes) )
			return [];

		const out = [], seen = new Set;
		for(const node of nodes) {
			if ( ! node || seen.has(node.id) )
				continue;

			seen.add(node.id);
			out.push(this.memorizeTag(node));
		}

		return out;
	}

	/**
	 * Queries tag languages
	 * @function getLanguagesFromTags
	 * @memberof TwitchData
	 *
	 * @param {int[]} tags - an array of tag IDs
	 * @returns {string[]} tag information
	 *
	 * @example
	 *
	 *  console.log(this.twitch_data.getLanguagesFromTags([50, 53, 58, 84]));
	 */
	getLanguagesFromTags(tags, callback) { // TODO: actually use the callback
		const out = [],
			fn = callback ? debounce(() => {
				this.getLanguagesFromTags(tags, callback);
			}, 16) : null

		if ( Array.isArray(tags) )
			for(const tag_id of tags) {
				const tag = this.getTagImmediate(tag_id, fn);
				if ( tag && tag.is_language ) {
					const match = LANGUAGE_MATCHER.exec(tag.name);
					if ( match )
						out.push(match[1]);
				}
			}

		return out;
	}

	/**
	 * Search tags
	 * @function getMatchingTags
	 * @memberof TwitchData
	 * @async
	 *
	 * @param {string} query - the search string
	 * @param {string} [locale] - UNUSED. the locale to return tags from
	 * @param {string} [category=null] - the category to return tags from
	 * @returns {string[]} an array containing tags that match the query string
	 *
	 * @example
	 *
	 *  console.log(await this.twitch_data.getMatchingTags("Rainbo"));
	 */
	async getMatchingTags(query, locale, category = null) {
		/*if ( ! locale )
			locale = this.locale;*/

		const data = await this.queryApollo({
			query: await import(/* webpackChunkName: 'queries' */ './data/search-tags.gql'),
			variables: {
				query,
				categoryID: category || null,
				limit: 100
			}
		});

		const nodes = data?.data?.searchLiveTags;
		if ( ! Array.isArray(nodes) || ! nodes.length )
			return [];

		const out = [];
		for(const node of nodes) {
			const tag = this.memorizeTag(node);
			if ( tag )
				out.push(tag);
		}

		return out;
	}
}
