
function PortalChat(userId) {
    this.debug = {
        identifier : 'New Portalchat w/o wizard',
        logging    : true,
        isOldIE    : false
    };

    this.settings = {
        version              : "1.1.5",
        socketIoPort         : 8010,
        socketOptions        : {
            transports: ['websocket', 'polling'],
            'sync disconnect on unload': false
        },
        hidden               : false,
        showHardcore         : true,
        inactive             : false,
        uid                  : 0,
        portalId             : '',
        nick                 : '',
        coins                : 0,
        language             : 'en',
        controllerUrl        : '/n/portalchat/',
        conversationsApiUrl  : '/n/portalchat/userconversations/',
        globalWrapper        : '#portalchat-wrapper',
        conversationsWrapper : '#pc-conversations',
        conversationTab      : '#conversation-tab-',
        buyCoinsUrl          : '/?ac=user&ac2=buycoins',
        emoticonsBaseUrl     : '/pubcdn/source/Global/default/img/emotes/ebebeb/',
        emoticonsContainer   : '#portalchat-wrapper',
        replaceEmoticons     : true,
        adminUser        : {
            username:  "mydirtyhobby",
            portal:  "mdh"
        },
        emoticons        : [
            'zwinker', 'abspritzen', 'anal', 'angst', 'blasen', 'cool', 'dicker_finger', 'engel', 'erstaunt', 'ficken', 'grins', 'herz', 'heul', 'kichern', 'klatschen', 'krank', 'kuss', 'lachen', 'latte', 'lecken', 'master', 'neid', 'peinlich', 'rock', 'schlafen', 'sm', 'teufel', 'titten', 'wixen', 'zunge'
        ],
        virtualCurrency: {
            name: 'DirtyCent',
            short: 'DC',
            factor: 1,
        },
        uploadFileTypes: ['image/jpeg', 'image/jpg'],
        userCoinsPanel   : '.site-header__box__money',
        replacableDomains: [],
        isTopAmateursNeedsToBeReloaded: false,
        isApproveAmateur: true
    };

    this.events = {
        conversationLoaded: function () {},
        msgLoaded: function () {}
    };

    this.userSettings = {
        isMuted             : false,
        contactListOpen     : true,
        showChangePriceInfo : true
    };

    this.friendlists = {
        defaultList : 'favorites',
        favorites   : {
            selector : '#pc-favorites'
        },
        history     : {
            selector : '#pc-history'
        }
    };

    this.translations = {
        currency: 'DC',
        errorNotEnoughDC       : 'dict::notEnoughDc',
        errorNotEnoughDcBuyNow : 'dict::buyNow',
        toggleShowHide         : 'dict::show/hide',
        toggleClose            : 'dict::close',
        toggleSound            : 'dict::Sound on/off',
        closeSetMessagePrice   : 'dict::closeSetMessagePrice',

        profile : {
            labelGender      : 'dict::gender',
            labelAge         : 'dict::age',
            labelMarital     : 'dict::maritalStatus',
            labelOrientation : 'dict::orientation',
            labelLocation    : 'dict::location',
            valueGender      : {},
            valueMarital     : {},
            valueOrientation : {}
        },

        infoNoFavorites     : 'dict::noFavoritesOnline',
        infoNoHistory       : 'dict::noRecentChatsFound',
        pricePerMessage     : 'dict::pricePerMessage',
        messageFree         : 'dict::messageFree',
        infoIgnored         : 'dict::infoIgnored',
        infoIgnoring        : 'dict::infoIgnoring',
        infoSystemMessage   : 'dict::infoSystemMessage',
        chatSetMessagePrice : 'dict::chatSetMessagePrice'
    };

    this.socket = null;
    this.userinfo = [];
    this.conversations = {};
    this.contactlist = {};
    this.portalId = 'mdh';
    this.userId = userId.toLowerCase();
    this.visibility = 'online';
    this.fileUpload = (window.File || window.FileReader && window.FileList && window.Blob);

    this.initialized = false;
    this.sid = null;
}

/**
 * init PortalChat, establish connections, add socket handlers
 */
PortalChat.prototype.initChat = function() {
    var _self = this;

    /** restore user settings */
    _self.loadSettings();

    /** restore contactlist from localStorage */
    _self.loadContactlist();

    /** establish connection */
    _self.socket = io(_self.settings.socketIoHost + ":" + _self.settings.socketIoPort, _self.settings.socketOptions);

    _self.receiveMessage = function(message) {
        var user = {username:message.to, portal: message.to_portal};
        var align = 'right';
        if (message.from != _self.userId || message.from_portal != _self.portalId) {
            user = {username:message.from, portal: message.from_portal};
            align = 'left';
        }

        if (message.source == 'system') {
            switch (message.type) {
                case 'addcontact':

                    if (message.from == _self.userId && message.from_portal == _self.portalId) {
                        _self.socket.emit('getContact', _self.portalId, message.to, function(data) {
                            _self.contactlist[message.to] = data;
                            _self.createContactlistItem(_self.contactlist[message.to], '.pc-contactlist', 'prepend');
                            _self.deleteTopAmateursForUser();
                            _self.hideAlertInfoForFavorites();
                        });
                    } else {
                        // optional info that from has added to to contact list
                    }
                    return;
                    break;
                case 'removecontact':
                    if (message.from == _self.userId && message.from_portal == _self.portalId) {
                        jQuery('#contactListItem-' + message.to_portal + '-' + message.to).slideUp(300, function () {
                            jQuery(this).popover('destroy').remove();
                            _self.deleteTopAmateursForUser();
                            _self.showAlertInfoForFavorites();
                        });
                    } else {
                        // optional info that from has removed from contact list
                    }
                    return;
                case 'ignorecontact':
                case 'unignorecontact':
                    var ignore = (message.type == 'ignorecontact') ? 1 : 0;

                    if(message.from == _self.userId && message.from_portal == _self.portalId){
                        _self.socket.emit('getContact', _self.portalId, message.to, function(data) {
                            data.isIgnoring = ignore;
                            _self.contactlist[message.to] = data;
                            _self.updateConversationTab(_self.contactlist[message.to]);
                        });
                    }
                    else{
                        _self.socket.emit('getContact', _self.portalId, message.from, function(data) {
                            data.isIgnored = ignore;
                            _self.contactlist[message.from] = data;
                            _self.updateConversationTab(_self.contactlist[message.from]);
                        });
                    }
                    return;
                case 'changeprice':
                    _self.socket.emit('getContact', _self.portalId, message.from, function(data) {
                        var messagePrice = message.message;
                        data.currentPrice = messagePrice.currentPrice;
                        data.chargingCondition = messagePrice.chargingCondition;
                        data.price = messagePrice.price;
                        _self.contactlist[message.from] = data;
                        _self.updateConversationTab(_self.contactlist[message.from]);
                    });
                    return;
                case 'updatecontact':
                    _self.socket.emit('getContact', _self.portalId, message.from, function(data) {
                        _self.contactlist[message.from] = data;
                        _self.updateConversationTab(_self.contactlist[message.from]);
                    });
                    return;
                case 'updatecoins':
                    updateUserBalance(message.message, '.js-header-dc-balance', ' ' + _self.translations.currency, _self.settings.formatCoins);
                    return;
                case 'processingfailed':

                    break;
            }
        }

        if(message.type == 'typing'){
            if( message.from != _self.userId || message.from_portal != _self.portalId){
                jQuery(document).trigger('typingstart', [ message.from_portal, message.from ]);
            }
            return;
        }

        if (message.from == _self.settings.adminUser.username && message.from_portal == _self.settings.adminUser.portal) {
            if (message.message.length > 160) {
                return;
            }
        }

        if ( (_self.visibility == 'offline' || _self.visibility == 'away') && (_self.userId != message.from || _self.portalId != message.from_portal) ) {
            var id  = '#conversation-tab-' + _self.idEscape(message.from) + '-' + message.from_portal;
            if (jQuery(id).length == 0 && jQuery('.mg-mailbox').length == 0) {
                _self.addNotificationHeaderMessage(user.username, message.message, message.conversationId);
                return;
            }
        }

        jQuery.when(_self.initConversationByUsername(user.portal, user.username)).then(function() {
            jQuery(document).trigger('typingend', [ message.from_portal, message.from ]);
            _self.addMessage(message, user, align, true);
            _self.notifyConversation(user.portal, user.username, (message.from == _self.userId && message.from_portal == _self.portalId));
            window.setTimeout(function() {
                _self.scrollToLastMsg(user.portal, user.username, true);
            }, 20); // chrome workaround

        });
    };


    _self.addNotificationHeaderConversations = function(conversations) {
        conversations.data = conversations.data.reverse();
        for (n in conversations.data) {
            var current = conversations.data[n];
            var username = '';
            current.users.forEach(function(user) {
                if (user.username !== _self.userId && user.portal !== _self.portal) {
                    username = user.username;
                }
            });

            _self.addNotificationHeaderMessage( username,  current.last_message.message, current.conversationId);
        }
    }

    _self.addNotificationHeaderMessage = function(username, msg, conversationId) {

        if (msg == '') {

            msg = '<i class="message-icon fa fa-paperclip"></i>';
        } else {
            msg = msg.replace(/<.*?>/g, '').substr(0, 15);
        }

        jQuery('li.js-header-message-link-' + conversationId).remove();
        var tmpl = '<li class="js-header-message-link-{conversationId}"><a class="js-header-message-link" data-conversation-id ="{conversationId}"  href="/messaging/#{conversationId}"><p class="message-sender"><strong>{from}</strong></p><p class="message-subject">{msg}</p></a></li>';
        var msg = tmpl.replace(/\{from\}/, username).replace(/\{msg\}/, msg).replace(/\{conversationId\}/g, conversationId);

        jQuery('.header-messagelist').prepend( msg );
        _self.updateNotificationHeaderCount();
    }

    _self.removeNotificationHeaderMessage = function(conversationId) {
        var self = this;
        window.setTimeout(function() {
            jQuery('.js-header-message-link-' + conversationId).remove();
            self.updateNotificationHeaderCount();
        }, 1000);
    }

    _self.updateNotificationHeaderCount = function() {
        var num = jQuery('.js-header-message-link').length;
        num = (num>9) ? '&gt;9' : num;
        if (num == 0) {
            jQuery('#js-header-message-count').hide();
            jQuery('#js-header-envelope').removeClass('fa-envelope-o').addClass('fa-envelope');
            jQuery('#header-messagelist-alert').show();

        } else {
            jQuery('#js-header-message-count').html(num).show();
            jQuery('#js-header-envelope').removeClass('fa-envelope-o').addClass('fa-envelope');
            jQuery('#header-messagelist-alert').hide();
        }
    }

    var logError = function (s, e) {
        //jQuery.post('/n/portalchat/jserror', {status: s, error: e, uid: _self.userId});
    };

    /** handle 'connected' event */
    _self.socket.on('connect', function(s) {
        _self.sid = _self.socket.io.engine.id;
    });

    /** handle 'ready' event */
    _self.socket.on('ready', function(s) {

        if (!_self.initialized) {
            _self.restoreTabs();

            /** get information on current user (i.e. own message price) */
            _self.socket.emit('getContact', _self.portalId, _self.userId, function(data) {
                _self.visibility = data.visibility;
                if (_self.settings.isApproveAmateur && _self.userSettings.showChangePriceInfo && data.userType === 'amateur') {
                    if (jQuery('#priceInfoAlert').length == 0) {
                        var messagePrice = _self.getMessagePrice( data.price, data.chargingCondition, data.isCustomer);
                        var template = '<div class="alert alert-info fade in" id="priceInfoAlert">'
                            + '<button type="button" class="close-alert js-close-price-info" data-dismiss="alert" title="' + _self.translations.closeSetMessagePrice + '"><i class="fa fa-times"></i></button>'
                            + '<strong><i class="fa fa-info-circle"></i> ' + messagePrice + '</strong>'
                            + '<p>' + _self.translations.chatSetMessagePrice + '</p></div>';
                        jQuery(template).hide().prependTo('.pc-friendlist-wrapper > .tab-content').slideDown(300);
                    }
                }
                _self.updateConversationTab(data); // apply my current status
            });

            _self.socket.emit('getConversationsForUserCached', 10, 0, 'inbox', false, 'unread', _self.addNotificationHeaderConversations );

            _self.initClickHandlers();

            if ( _self.settings.isTopAmateursNeedsToBeReloaded ){
                _self.deleteTopAmateursForUser();
            }
            
            _self.socket.emit('getContacts', _self.friendlists.defaultList);
        }
    });

    _self.socket.on('connect_error', function(e){
        logError('connect_error', e.message);
    });

    _self.socket.on('error', function(e){
        logError('socket_error', e.toString());
    });

    /** handle 'disconnected' event */
    _self.socket.on('disconnect', function() {
    });

    _self.socket.on('reconnecting', function(e) {
        // console.log("reconnecting....");
    });

    /** contacts loaded, after requesting contacts getContacts("favorites"|"history") */
    _self.socket.on('contactsLoaded', function(type, contacts) {
        // console.log("contactsLoaded....");

        _self.createContactList(type, contacts);

        /** restore conversations and initialize click handlers on first load */
        if (!_self.initialized) {
            _self.initialized = true;
            // console.log("initialized!!!!!!!!!....");
        }

        _self.storeContactList();
    });

    /** topamateurs loaded, after requesting contacts getContacts("topamateurs") to fill the contacts */
    _self.socket.on('topamateursLoaded', function(contacts) {
        _self.loadTopamateurslist(contacts);
    });

    /** someone sent me message(s) while offline */
    _self.socket.on('offlineConvLoaded', function(offlineSenderList) {
        jQuery.each(offlineSenderList, function(offlineSender) {
            /** @todo use dynamic portalId from node-server */
            _self.initConversationByUsername(_self.portalId, offlineSenderList[offlineSender]);
        });
    });

    /**
     * status-changes
     * status: "online" (as defined in PortalchatModel)
     * userId  can be my own - or another user i am interested in (friendlist), has changed his status
     *
     * // emitting openConversation + closeConversation
     * _self.socket.emit('openConversation', conversationId);
     * _self.socket.emit('closeConversation', conversationId);
     * status: "closeConversation" from other id
     * status: "openConversation" from other id
     *
     */
    _self.socket.on('updateOnlineStatus', function(status, portal, username) {
        _self.updateStatus(status, portal, username);
    });

    _self.socket.on('updateVisibility', function(visibility, portal, username) {
        _self.updateStatus(visibility,  portal, username);
    });

    /** handle new message, open conversation and append new message */
    _self.socket.on('receiveMessage', _self.receiveMessage);

    /** handle disconnect */
    _self.socket.on('disconnect', function() {
    });

    /** handle update coins */
    _self.socket.on('updateCoins', function(paid) {
        var coinsPanel = jQuery(_self.settings.userCoinsPanel);

        var currentBalance = parseFloat(coinsPanel.text()),
            newBalance = currentBalance - paid;

        coinsPanel.text(newBalance + ' DirtyCents');
    });
};

PortalChat.prototype.restoreTabs = function() {
    jQuery('.pc-tab-wrapper').remove();
    var _self = this,
        id = _self.userId + '_' + _self.portalId + '_portalchat-conversations';

    var myTabs = [];
    if (typeof(Storage) !== 'undefined') {
        try {
            if (localStorage.getItem(id) != null) {
                myTabs = JSON.parse(localStorage.getItem(id));
            }
        } catch (e) {
            if (_self.debug.logging) {
                console.error('PortalChat::error \n\t' + e.message);
            }
            return false;
        }
    }

    var tabsProm = [];
    for (var n in myTabs) {
        var el = myTabs[n];
        var options = {
            'dontFitConversations': true,
            'minimized': el.minimized,
            'modified': el.modified
        };
        if (!(el.portal == _self.settings.adminUser.portal && el.username == _self.settings.adminUser.username)) {
            tabsProm.push(_self.initConversationByUsername(el.portal, el.username, options));
        }
    }
};

PortalChat.prototype.saveTabs = function() {
    var _self = this;
    var myTabs = [];
    jQuery.each( jQuery('.pc-tab-wrapper'), function(i, el) {
        myTabs.push({
            'portal': jQuery(this).data('portal'),
            'username': jQuery(this).data('recipient'),
            'minimized': jQuery(this).hasClass('minimized'),
            'visible': jQuery(this).is(":visible"),
            'notification': jQuery(this).find('.glowing:visible').length > 0,
            'modified': jQuery(this).data('modified') || 0
        });

    });
    //this.socket.emit('setTabs', myTabs);
    /** store conversations to local storage */
    if (typeof(Storage) !== 'undefined') {
        try {
            localStorage.setItem(_self.userId + '_' + _self.portalId + '_portalchat-conversations', JSON.stringify(myTabs));
        } catch (e) {
            if (_self.debug.logging) {
                console.error('PortalChat::error \n\t' + e.message);
            }
        }
    }

};

/**
 * create contact list
 *
 * @param listType ('favorites'|'history')
 * @param contacts array
 */
PortalChat.prototype.createContactList = function(listType, contacts) {


    var _self = this;

    var contactCount = Object.keys(contacts).length;
    var targetContainer = (listType == 'history')
        ? _self.friendlists.history.selector
        : _self.friendlists.favorites.selector;

    if (contactCount > 0) {
        jQuery(targetContainer).empty();
        var contactList = jQuery('<ul class="pc-friendlist pc-contactlist"></ul>').appendTo(targetContainer);

        var onlineContacts = [];
        var offlineContacts = [];

        jQuery.each(contacts, function(idx, contact) {
            contact.visibility = typeof contact.visibility != 'undefined' ? contact.visibility : 'offline';
            var displaystatus = (contact.onlinestatus == 'online') ? contact.visibility : 'offline';
            if(displaystatus == 'online'){
                onlineContacts.push(contact);
            }
            else{
                offlineContacts.push(contact);
            }
        });

        if(onlineContacts.length < 150){
            var fillContacts = offlineContacts.splice(0,150-onlineContacts.length);
            onlineContacts = onlineContacts.concat(fillContacts);
        }

        jQuery.each(onlineContacts, function(idx, contact) {
            _self.createContactlistItem(contact, contactList);
        });
    } else {
        jQuery(this.friendlists.favorites.selector).html('<div class="alert alert-info">' + _self.translations.infoNoFavorites + '</div>');
        jQuery('<ul class="pc-friendlist pc-contactlist"></ul>').appendTo(targetContainer);
    }

    if(_self.socket && listType == 'favorites'){
        _self.socket.emit('getContacts', 'topamateurs');
    }

};

/**
 * hides the alertInfo dialog
 */
PortalChat.prototype.hideAlertInfoForFavorites = function(){
    jQuery(this.friendlists.favorites.selector + '>.alert').hide();
};

/**
 * shows the alertInfo dialog if there is no more visible contacts
 */
PortalChat.prototype.showAlertInfoForFavorites = function(){
    var children = jQuery('.pc-friendlist.pc-contactlist').children();
    var isShown = false;
    var length = children.length;
    for( var i = 0; i < length; i++ ){
        if ( jQuery(children[i]).is(":visible") ){
            isShown = true;
            break;
        }
    }

    if ( !isShown ){
        jQuery(this.friendlists.favorites.selector + '>.alert').show();
    }
};

/**
 * create contact list item, append it to the parent container and initialize info panel popover
 *
 * @param contact
 * @param parentContainer
 * @param position
 */
PortalChat.prototype.createContactlistItem = function(contact, parentContainer, position) {
    var _self = this;

    if (typeof contact.active != 'undefined' && contact.active*1 != 1 ) {
        return;
    }

    if (contact.userType == 'admin'){
        return;
    }

    contact.visibility = typeof contact.visibility != 'undefined' ? contact.visibility : 'offline';
    var displaystatus = (contact.onlinestatus == 'online') ? contact.visibility : 'offline';

    position = (typeof position !== 'undefined') ? position :  ( (displaystatus == 'online') ? 'prepend' : 'append' );
    var webcamLink = '';

    if (contact.webcamStatus == 'online') {
        webcamLink = '<div class="status"><a href="' + contact.camUrl + '" alt="Livecam" title="Livecam"><i class="fa fa-fw fa-video-camera status-online"></i></a></div>';
    }

    var userId = contact.portal + '-' + contact.username;

    var avatar = contact.avatar;
    if(_self.settings.showHardcore){
        avatar = contact.avatarHc || contact.avatar;
    }

    jQuery('#contactListItem-' + userId).remove();
    var template = '<li id="contactListItem-' + userId + '" class="pc-status ' + displaystatus + ' js-status-badge-' + userId + ' ' + displaystatus + '">'
        + '<img class="avatar js-avatar" src="' + avatar + '" alt="' + contact.nick + '">'
        + '<div class="nickname"><a href="#" class="js-start-chat" data-portal="' + contact.portal + '" data-recipient="' + contact.username + '" >' + contact.nick + '</a></div>'
        + webcamLink
        + '</li>';

    if (position == 'append') {
        jQuery(template).appendTo(parentContainer).popover(_self.createInfopanel(contact));
    } else if (position == 'prepend') {
        jQuery(template).prependTo(parentContainer).popover(_self.createInfopanel(contact));
    }

};


/**
 * load conversation tab
 *
 * @param portal
 * @param username
 * @param options
 */
PortalChat.prototype.initConversationByUsername = function(portal, username, options) {

    if (this.settings.inactive && (typeof options == 'undefined' || options.inactive)) {
        return;
    }

    var _self = this,
        def = jQuery.Deferred(),
        id  = '#conversation-tab-' + _self.idEscape(username) + '-' + portal;

    var tab = jQuery(id);

    if ( jQuery(id).length > 0) {
        def.resolve('tabInitDone');
        return;
    }

    _self.createEmptyConversationTab(username, portal, options);

    _self.socket.emit('getContact', portal, username, function(data) {
        jQuery.when(_self.loadConversationTabHistory(username, portal), _self.updateConversationTab(data, options)).then(function() {
            def.resolve('tabInitDone');
        });
    });

    return def.promise();
};

PortalChat.prototype.createEmptyConversationTab = function(username, portal, options) {
    if (typeof options == 'undefined') {
        options = {};
    }
    var minimized = options.minimized || false;
    var modified = options.modified || 0;
    var _self = this;

    var userId = _self.idEscape(username) + '-' + portal;

    var template = ''
        + '<div class="pc-tab-wrapper ' + (minimized ? 'minimized' : '') + '" id="conversation-tab-' + userId + '" data-modified="' + modified + '" data-recipient="' + username + '" data-portal="' + portal + '" data-nick="">'
        + '<div class="pc-conversation-tab">'
        + '<div class="tab-header">'
        + '<div class="tab-header-status" id="online-status-' + portal + '-' + username + '"></div>'
        + '<div class="tab-controls" role="toolbar">'
        + '<a href="" id="conversation-tab-openfull-' + userId + '" class="btn" title="' + _self.translations.openFullConversation + '">&#xf14c;</a>'
        + '<a href="#" id="conversation-tab-toggle-' + userId + '" class="btn tab-toggle js-toggle-tab" data-target="#conversation-tab-' + userId + '" title="' + _self.translations.toggleShowHide + '">.</a>'
        + '<a href="#" class="btn tab-close js-close-tab" data-target="#conversation-tab-' + userId + '" title="' + _self.translations.toggleClose + '">&#xf00d;</a>'
        + '</div>'
        + '</div>'
        + '<div class="tab-body">'
        + '<div class="user-info pc-status js-status-badge-' + portal + '-' + username + '">'
        + '<img id="conversation-tab-avatar-' + userId + '" class="avatar" src="#" alt="">'
        + '<a id="conversation-tab-profileurl-' + userId + '" class="nickname" href="#" title=""><span class="username-' + userId + '">...</span><i class="fa fa-comments glowing" style="display:none"></i></a>'
        + '<div id="conversation-tab-indicator-' + userId + '" class="type-indicator"><i class="fa fa-pencil glowing"></i><span>' + username + ' ' + _self.translations.infoTyping + '</span></div>'
        + '<div id="conversation-tab-price-' + userId + '" class="price"></div></div>'
        + '<div id="conversation-tab-info-' + userId + '" class="alert-ignored"></div>'
        + '<ul id="conversation-messages-' + userId + '" class="messages js-drop-fileupload-pc" data-recipient="' + username + '" data-portal="' + portal + '"></ul>'
        + '<div id="conversation-tab-input' + userId + '" class="tab-input">'
        + '<form method="post" class="js-message-form" id="form-' + userId + '"  data-recipient="' + username + '" data-portal="' + portal + '">'
        + '<textarea name="message" class="js-message-text" id="input-' + userId + '" maxlength="1000" style="width:135px;"></textarea>'
        + '<input id="targetUpload-' + userId + '" data-recipient="' + username + '" data-portal="' + portal + '" type="file" accept=".jpg" class="js-upload-file-pc" style="display: none;" />'
        + '<button class="btn btn-default btn-fileupload js-show-fileupload-pc" id="Upload-' + userId + '"><i class="fa fa-file-o"></i></button>'
        + '<button class="btn btn-default btn-emoticon js-show-emoticons" id="emoticons-' + userId + '"><i class="fa fa-smile-o"></i></button>'
        + '</form>'
        + '</div>'
        + '</div>'
        + '</div>'
        + '</div>';

    var tab = jQuery(template);
    if (username == _self.settings.adminUser.username && portal == _self.settings.adminUser.portal) {
        tab.find('#conversation-tab-input' + userId ).remove();
    }

    tab.appendTo(_self.settings.conversationsWrapper);
    _self.events.conversationLoaded();
}

PortalChat.prototype.updateConversationTab = function(conversation, options) {
    var _self = this,
        def = jQuery.Deferred();

    var displayStatus = (conversation.onlinestatus == 'online') ? conversation.visibility : 'offline';

    var ignoredInfo = '';
    if (conversation.isIgnored == 1) {
        ignoredInfo = '<div class="alert alert-danger">' + _self.translations.infoIgnored + '</div>';
    }

    if (conversation.isIgnoring == 1) {
        ignoredInfo = '<div class="alert alert-danger">' + _self.translations.infoIgnoring + '</div>';
    }

    var messagePrice = '';
    if(conversation.username == _self.settings.adminUser.username && conversation.portal == _self.settings.adminUser.portal) {
        ignoredInfo = '';
        messagePrice = _self.translations.infoSystemMessage;
    } else {
        messagePrice = _self.getMessagePrice(conversation.price, conversation.chargingCondition, conversation.isCustomer);
    }

    var toggleIcon = (typeof options != 'undefined' && options.minimized) ? '&#xf151;' : '&#xf150;';
    var dataModified = (typeof options != 'undefined' && typeof options.modified != 'undefined') ? options.modified : 0;

    var encodedusername = _self.idEscape(conversation.username);
    var userId = encodedusername + '-' + conversation.portal;

    var cTab = jQuery('#conversation-tab-' + userId);

    var avatar = conversation.avatar;
    if(_self.settings.showHardcore){
        avatar = conversation.avatarHc || conversation.avatar;
    }

    cTab.data('nick', conversation.nick);
    cTab.data('modified', dataModified);
    jQuery('#conversation-tab-toggle-' + userId).html(toggleIcon);
    jQuery('#conversation-tab-openfull-' + userId).attr('href', '/messaging/#' + conversation.conversationId + '|' + encodedusername + '|' + conversation.portal );
    jQuery('#conversation-tab-info-' + userId).html(ignoredInfo);
    jQuery('#conversation-tab-price-' + userId).html(messagePrice);
    jQuery('#conversation-tab-avatar-' + userId).attr('src', avatar);
    jQuery('#conversation-tab-profileurl-' + userId).attr('href', conversation.profileUrl);
    jQuery('.js-status-badge-' + conversation.portal + '-' + encodedusername).removeClass('online offline away').addClass(displayStatus).data('status', displayStatus);
    jQuery('.username-' + userId).html(conversation.nick);

    var messageForm = jQuery('#form-' + userId);

    if (conversation.isIgnored == 1 || conversation.isIgnoring == 1) {
        messageForm.find('textarea, button').prop('disabled', true);
    } else {
        messageForm.find('textarea, button').prop('disabled', false);
    }

    if (typeof options !== 'undefined' && options.minimized) {
        cTab.addClass('minimized');
    }

    var webcamStatus       = conversation.webcamStatus,
        headerStatus       = '',
        conversationStatus = jQuery('#online-status-' + conversation.portal + '-' + encodedusername);

    if (webcamStatus === 'online') {
        headerStatus = '<a href="' + conversation.camUrl + '" class="btn pc-livecam js-load-webcam-new" title="Livecam"><i class="fa fa-video-camera status-online"></i></a>';
        conversationStatus.removeClass('cam-online online last-online cam-pause cam-private').addClass('cam-online');
    } else if (webcamStatus === 'pause') {
        headerStatus = '<a href="' + conversation.camUrl + '" class="btn pc-livecam js-load-webcam-new" title="Livecam"><i class="fa fa-video-camera status-away"></i></a>';
        conversationStatus.removeClass('cam-online online last-online cam-private').addClass('cam-pause');
    } else if (webcamStatus === 'private') {
        headerStatus = '<a href="' + conversation.camUrl + '" class="btn pc-livecam js-load-webcam-new" title="Livecam"><i class="fa fa-video-camera"></i></a>';
        conversationStatus.removeClass('cam-online online last-online cam-pause').addClass('cam-private');
    } else {
        if (displayStatus === 'online') {
            headerStatus = 'Online';
            conversationStatus.removeClass('cam-online online offline away').addClass('online');
        } else if (displayStatus === 'away') {
            headerStatus = 'Away';
            conversationStatus.removeClass('cam-online online offline away').addClass('away');
        } else {
            headerStatus = 'Offline';
            conversationStatus.removeClass('cam-online online offline away').addClass('offline');
        }
    }

    conversationStatus.html(headerStatus);

    _self.fitConversations();
};

PortalChat.prototype.loadConversationTabHistory = function(username, portal) {
    var _self = this,
        def = jQuery.Deferred();

    _self.socket.emit('openConversation', portal, username, function(data) {

        if (data.length) {
            jQuery.each(data, function(index, message) {

                var user = {username:message.to, portal: message.to_portal};
                var align = 'right';
                if (message.from != _self.userId || message.from_portal != _self.portalId) {
                    var user = {username:message.from, portal: message.from_portal};
                    align = 'left';
                }

                _self.addMessage(message, user, align, false);
            });
            _self.scrollToLastMsg(portal, username, false);
        }

        def.resolve('tabInitDone');
    });

    return def.promise();
};

PortalChat.prototype.addMessage = function (message, user, align, appendTo){
    var _self = this;

    var messages = jQuery( '#conversation-messages-' + _self.idEscape(user.username) + '-' + user.portal );

    var messageTitle = new Date( message.timestamp.replace(/-/g, '/') ).toLocaleString().split(' ')[1];

    var messagebody = '';
    var linksReplacer = new LinksReplacer();
    if (user.username == _self.settings.adminUser.username && user.portal == _self.settings.adminUser.portal) {
        if (message.message.match(/<a/)) {
            messagebody = _self.replaceEmoticons(message.message);
        } else {
            messagebody = _self.replaceEmoticons(linksReplacer.replaceForMessaging(message.message, this.settings.replacableDomains));
        }

    } else {
        messagebody = _self.replaceEmoticons(linksReplacer.replaceForMessaging(_self.htmlEscape(message.message), this.settings.replacableDomains));
    }

    if (message.attachments && message.attachments.length > 0) {
        for (var i in message.attachments) {
            messagebody += '<a href="' + message.attachments[i].original + '" class="has-preview js-fancybox" rel="preview-' + user.portal + '-' + user.username + '">';
            messagebody += '<img class="attachement-preview" src="' + message.attachments[i].small + '" onLoad="portalChatApi.scrollToLastMsg(\'' + user.portal + '\', \'' + user.username + '\', false);"/><i class="fa fa-search-plus customIcon" aria-hidden="true"></i>'
            messagebody += '</a>';
        }
    }
    if (message.type == 'processingfailed') {
        messageTitle = message.errormessage.replace(/<.*?>/g, '');
        messagebody += ' <i class="fa fa-times"></i> ';
    } else if (message.type == 'processingdelayed') {
        messageTitle = message.errormessage;
        messagebody += ' <i class="fa fa-clock-o"></i> ';
    } else {
        messagebody += ' <i class="fa fa-check"></i> ';
    }

    var getMessageElement = function (elClass, elTitle, elClientId, elTimestamp, elBody) {
        return jQuery('<li class="' + elClass + '" title="' + elTitle + '" data-clientid="' + elClientId + '" data-timestamp="' + elTimestamp + '">' + elBody + '</li>');
    };

    jMessage = getMessageElement(align, messageTitle, message.client_id, timestamp, messagebody);

    var timestamp = jMessage.data('timestamp')*1000;

    if(timestamp){
        var messageDate = new Date(timestamp).toLocaleDateString();
        var messageTime = new Date(timestamp).toLocaleTimeString().slice(0,-3);
        var dateChanged = (!_self.lastMessage) || messageDate !== _self.lastMessage;
        if(dateChanged){
            messages.append('<li class="info">' + messageDate + ' ' + messageTime + '</li>');
        }
        _self.lastMessage = messageDate;
    }

    var tooltipPlacement = jMessage.hasClass('left') ? 'right' : jMessage.hasClass('right') ? 'left' : null;

    if(appendTo){
        var exists = messages.find('li[data-clientid="' + message.client_id + '"]');
        if (exists.length > 0) {
            exists.before(jMessage);
            exists.remove();
        } else {
            jMessage.appendTo(messages);
        }

    }else{
        jMessage.prependTo(messages);
    }

    if (message.errormessage && message.errormessage.length) {
        var errorMessageElement = getMessageElement('alert alert-danger', '', message.client_id, timestamp + 1, _self.replaceEmoticons(message.errormessage));
        errorMessageElement.appendTo(messages);
    }

    if(tooltipPlacement){
        jMessage.tooltip({placement: tooltipPlacement});
    }

    _self.events.msgLoaded();
};

/**
 * create a conversation tab
 *
 * @param conversation
 * @param options
 */
PortalChat.prototype.createConversationTab = function(conversation, options) {

    var _self = this,
        def = jQuery.Deferred();

    /**
     * announce conversation to the chat-server, get message list in return
     */
    _self.socket.emit('openConversation', conversation.portal, conversation.username, function(data) {
        data = data.reverse();

        if (data.length) {
            jQuery.each(data, function(index, message) {
                _self.addMessage(message, false);
            });
            _self.scrollToLastMsg(conversation.portal, conversation.username, false);
        }

        def.resolve('openTabDone');
    });

    if (typeof options !== 'undefined' && options.minimized) {
        conversationTab.addClass('minimized');
    }

    _self.fitConversations();

    return def.promise();
};

/**
 * reorders open conversations to fit the screen, hide oldest conversations and display conversation overflow menu
 */
PortalChat.prototype.fitConversations = function() {
    var _self = this;

    var conversationsContainer = jQuery('#pc-conversations'),
        conversations = conversationsContainer.find('.pc-tab-wrapper');

    var margin = 2,
        conversationsWrapper = jQuery(_self.settings.conversationsWrapper),
        panelWidth = conversationsWrapper.children().last().outerWidth(),
        viewportWidth = jQuery(window).width(),
        numberOfPanels = Math.min(Math.floor(viewportWidth / panelWidth) - margin, conversations.length),
        conversationsSortList = [];

    jQuery.each(conversations, function(index, object) {
        var $object = jQuery(object);
        conversationsSortList.push({
            id       : '#conversation-tab-' + $object.data('recipient') + '-' + $object.data('portal'),
            recipient: $object.data('recipient'),
            nick     : $object.data('nick'),
            portal   : $object.data('portal'),
            modified : $object.data('modified') || 0
        });
    });

    conversationsSortList.sort(function(a, b) {
        return a.modified - b.modified;
    });

    for (var i = 0; i < numberOfPanels; i++) {
        var c = conversationsSortList.pop();
        conversationsContainer.children(c.id).show();
    }

    var overflowToggle = jQuery('.overflow-toggle'),
        overflowMenu = overflowToggle.find('.overflow-menu'),
        overflowMenuItems = 0;

    overflowMenu.empty();

    jQuery.each(conversationsSortList, function(index, conversation) {
        var overflowMenuEntry = '<li><a href="#" class="js-open-conversation" data-recipient="' + conversation.recipient +'"'
            + ' data-portal="' + conversation.portal + '"'
            + ' data-target="'+ conversation.id +'">'
            + conversation.nick + '</a></li>';

        conversationsContainer.children(conversation.id).hide();
        conversationsContainer.children(conversation.id).css({'display': 'none'});
        overflowMenu.append(overflowMenuEntry);
        overflowMenuItems++;
    });

    if (overflowMenuItems == 0) {
        overflowToggle.hide();
    } else {
        overflowToggle.find('.conversation-counter').text(overflowMenuItems);
        overflowToggle.show();
    }
    _self.saveTabs();
};

/**
 * init click handler for conversation tabs
 */
PortalChat.prototype.initClickHandlers = function() {
    var _self = this;

    var sendDebouncedTypingMessage = this.debounce(function(portal, recipient){
        _self.socket.emit('typing', portal, recipient);
    }, 1000, true);

    /** enable open/close animation */
    jQuery('#portalchat-wrapper, #pc-conversations').addClass('slide');

    /** handler: show/hide friendlist */
    jQuery('.js-toggle-friendlist').on('click', function(e) {
        e.preventDefault();

        jQuery('.pc-conversations-wrapper *').popover('hide');
        if (jQuery('#portalchat-wrapper').hasClass('open')) {
            jQuery(this).html('&#xf100;');
            _self.userSettings.contactListOpen = false;
        } else {
            jQuery(this).html('&#xf101;');
            _self.userSettings.contactListOpen = true;
        }

        jQuery('#portalchat-wrapper, #pc-conversations').toggleClass('open');

        if (jQuery('#portalchat-wrapper').hasClass('open')) {
            jQuery('body').addClass('sidechat-open');
        } else {
            jQuery('body').removeClass('sidechat-open');
        }

        _self.storeSettings();
    });

    /** handler: friendlist switching (favorites / history) */
    jQuery('.js-friendlist-toggle-view').on('show.bs.tab', function(e) {
        var trigger = jQuery(this),
            listType = trigger.data('list-type');
        _self.socket.emit('getContacts', listType);
    });

    /** handler: change status */
    jQuery(document).on('click', '.js-pc-set-status', function(e) {
        e.preventDefault();
        var status = jQuery(this).data('status');
        _self.socket.emit('setVisibility', status);
    });



    /** handler: open conversation */
    jQuery(document).on('click', '.js-start-chat', function(e) {
        e.preventDefault();
        _self.initConversationByUsername(jQuery(this).data('portal'), jQuery(this).data('recipient'), {inactive : false});

        /** iPad doesn't close the popover automatically... */
        if (navigator.userAgent.match(/iPhone/i) || navigator.userAgent.match(/iPod/i) || navigator.userAgent.match(/iPad/i)) {
            jQuery('.pc-conversations-wrapper *').popover('hide');
            jQuery(this).parents('li.pc-status').popover('hide');
        }
    });

    /** handler: show/hide conversation panel */
    jQuery(document).on('click','.js-toggle-tab', function(e) {
        e.preventDefault();

        var tabWrapper = jQuery( jQuery(this).data('target') );
        tabWrapper.toggleClass('minimized');

        if (tabWrapper.hasClass('minimized')) {
            jQuery(this).html('&#xf151;');
        } else {
            jQuery(this).html('&#xf150;');

            _self.scrollToLastMsg( tabWrapper.data('portal'), tabWrapper.data('recipient'), false);
            tabWrapper.find('.glowing').fadeOut(300);

        }
        _self.saveTabs();

    });

    /** handler: start new conversation panel */
    jQuery(document).on('click','.js-open-conversation', function(e) {
        e.preventDefault();

        jQuery(jQuery(this).data('target')).data('modified', Date.now());

        _self.fitConversations();
    });

    /** handler: close conversation */
    jQuery(document).on('click','.js-close-tab', function(e) {
        e.preventDefault();
        jQuery('.pc-conversations-wrapper *').popover('hide');
        jQuery( jQuery(this).data('target') ).remove();
        _self.fitConversations();
    });

    /** submit message on <enter> */
    jQuery(document).on('keydown','.js-message-text', function(e) {
        if (e.which == 13 && (!e.ctrlKey && !e.shiftKey)) {
            e.preventDefault();

            jQuery(this).parent('form').submit();
        } else if (e.which == 13 && (e.ctrlKey || e.shiftKey)) {
            var msg = jQuery(this).val();

            jQuery(this).val(msg + '\n');
        }
        else{
            var recipient = jQuery(this).parent().data('recipient');
            var portal = jQuery(this).parent().data('portal');
            sendDebouncedTypingMessage(portal, recipient);
        }
    });

    /** handle message submit */
    jQuery(document).on('submit','.js-message-form', function(e) {
        e.preventDefault();

        var messageBox = jQuery(this).find('textarea');
        var message = messageBox.val().trim();

        if (message.length > 0) {
            _self.sendMessage( jQuery(this).data('portal'), jQuery(this).data('recipient'), message);
            messageBox.val('');
        }
    });

    /** show emoticon selector */
    jQuery(document).on('click','.js-show-emoticons', function(e) {
        e.preventDefault();

        var dataTarget = '';
        if (typeof jQuery(this).data('target') != 'undefined' ) {
            dataTarget = jQuery(this).data('target');
        } else {
            dataTarget = jQuery(this).attr('id').replace('emoticons', 'input');
        }
        var trigger = jQuery(this),
            target = trigger.data('conversationid'),
            template = '<div class="pc-emoticons popover"><div class="popover-content clearfix"></div></div>',
            emoticonPanel = '<ul class="pc-emoticons" id="pc-emoticons-panel" data-target="' + dataTarget + '">' + _self.getEmoticons() + '</ul>';

        trigger.popover({
            trigger   : 'manual',
            html      : true,
            content   : emoticonPanel,
            title     : '',
            placement : 'top',
            container : _self.settings.emoticonsContainer,
            template  : template
        });

        /** hide all emoticon panels except own */
        if (_self.isMobile()) {
            var currentPopover = jQuery('.js-show-emoticons.has-popover');

            if (currentPopover.data('conversationid') != target) {
                currentPopover.popover('hide').removeClass('has-popover');
            }
        }

        trigger.popover('toggle').toggleClass('has-popover');
    });

    /** hide emoticon selector on blur (triggered after each insert) */
    jQuery(document).on('blur','.js-show-emoticons', function(e) {
        jQuery(this).popover('hide');
    });

    /** select emoticon and insert into textbox */
    jQuery(document).on('click', '.pc-emoticons-image', function(e) {

        var target = jQuery(this).parents('.pc-emoticons').first().data('target'),
            messageBox = jQuery('#' + target),
            message = messageBox.val();

        messageBox.val(message + ' ' + jQuery(this).attr('alt') + ' ').focus();
        jQuery('#emoticons-' + target).blur();
    });

    jQuery(document).on('click', '.js-show-fileupload-pc', function(e) {
        e.preventDefault();
        jQuery( '#target' + jQuery(this).attr('id')  ).click();
    });

    jQuery(document).on('dragover', '.js-drop-fileupload-pc', function(e) {
        e.stopPropagation();
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'copy';
    });

    jQuery(document).on('drop', '.js-drop-fileupload-pc', function(e) {
        e.stopPropagation();
        e.preventDefault();
        var trigger = jQuery(this);
        _self.handleFileUpload( trigger.data('portal'), trigger.data('recipient'), e.originalEvent.dataTransfer.files);
    });

    jQuery(document).on('change', '.js-upload-file-pc', function(e) {
        var trigger = jQuery(this);
        _self.handleFileUpload( trigger.data('portal'), trigger.data('recipient'), e.originalEvent.target.files);
        trigger.replaceWith(trigger.val('').clone(true));
    });

    /** remove active class on blur */
    jQuery(document).on('click', '.pc-tab-wrapper', function() {
        jQuery('.pc-tab-wrapper').removeClass('active');
        jQuery(this).addClass('active');
    });

    /** remove active class on blur */
    jQuery(document).on('blur, focusout', '.pc-tab-wrapper', function() {
        jQuery(this).removeClass('active');
    });

    /** toggle notification sounds (on/off) and stores current setting to localStorage */
    jQuery(document).on('click', '.js-mute-sounds', function() {
        var trigger = jQuery(this);

        if (_self.userSettings.isMuted) {
            _self.userSettings.isMuted = false;
            trigger.addClass('sounds-on').removeClass('sounds-off');
        } else {
            _self.userSettings.isMuted = true;
            trigger.addClass('sounds-off').removeClass('sounds-on');
        }

        _self.storeSettings();
    });

    /** trigger fitConversations on window resize */
    jQuery(window).resize(function() {
        _self.fitConversations();
    });

    /** steal focus to prevent layout issues on device rotation with open keyboard */
    jQuery(window).on('orientationchange', function() {
        jQuery(':focus').first().blur();
    });

    /** save dismissal to localStorage */
    jQuery(document).on('click','.js-close-price-info', function() {
        _self.userSettings.showChangePriceInfo = false;

        _self.storeSettings();
    });

    jQuery(document).on('typingstart', function(e, portal, username){
        var encodedusername = _self.idEscape(username);
        var userId = encodedusername + '-' + portal;

        var $cTab = jQuery('#conversation-tab-indicator-' + userId);

        var timeout = $cTab.data('timeout');

        if(timeout){
            clearTimeout(timeout);
            $cTab.data('timeout', null);
        }

        $cTab.addClass('is-typing');

        timeout = setTimeout(function(){
            jQuery(document).trigger('typingend', [ portal, username ]);
        }, 2000);

        $cTab.data('timeout', timeout);
    });

    jQuery(document).on('typingend', function(e, portal, username){
        var encodedusername = _self.idEscape(username);
        var userId = encodedusername + '-' + portal;

        var $cTab = jQuery('#conversation-tab-indicator-' + userId);
        $cTab.removeClass('is-typing');
        $cTab.data('timeout', null);
    });
};

/**
 * create an infopanel for a given contact
 *
 * @param contact
 * @returns object options for bs3-popover
 */
PortalChat.prototype.createInfopanel = function(contact) {
    var _self = this,
        countryFlag = '',
        age = 'n/a',
        gender = 'n/a',
        maritalstatus = 'n/a',
        orientation = 'n/a',
        template = '<div class="pc-infopanel popover"><div class="info-header popover-title"></div><div class="info-body popover-content"></div></div>';

    if (typeof contact.countrycode !== 'undefined') {
        countryFlag = '<span class="flag flag-' + contact.countrycode.toLowerCase() + '" title="' + contact.countrycode + '">' + contact.countrycode + '</span>';
    }

    if (typeof contact.birthday !== 'undefined') {
        age = _self.calculateAge(contact.birthday);

        if (isNaN(age)) {
            age = 'n/a';
        }
    }

    if (typeof contact.gender !== 'undefined' && contact.gender !== null) {
        gender = contact.gender;

        if (_self.translations.profile.valueGender[gender]) {
            gender = _self.translations.profile.valueGender[gender];
        }
    }

    if (typeof contact.orientation !== 'undefined' && contact.orientation !== null) {
        orientation = contact.orientation;

        if (_self.translations.profile.valueOrientation[orientation]) {
            orientation = _self.translations.profile.valueOrientation[orientation];
        }
    }

    if (typeof contact.maritalstatus !== 'undefined' && contact.maritalstatus !== null) {
        maritalstatus = contact.maritalstatus;

        if (_self.translations.profile.valueMarital[maritalstatus]) {
            maritalstatus = _self.translations.profile.valueMarital[maritalstatus];
        }
    }

    var avatar = contact.avatar;
    if(_self.settings.showHardcore){
        avatar = contact.avatarHc || contact.avatar;
    }

    return infopanel = {
        animation : true,
        html      : true,
        placement : 'left',
        trigger   : 'hover',
        container : '#portalchat-wrapper',
        template  : template,
        viewport  : {
            selector : '#portalchat-wrapper',
            padding  : 10
        },
        title     : '<img class="avatar" src="' + avatar + '" alt="' + contact.nick + '"><div class="nickname">' + contact.nick + '</div>',
        content   : '<dl class="profile-stats">'
        + '<dt>' + _self.translations.profile.labelGender + '</dt><dd>' + gender + '</dd>'
        + '<dt>' + _self.translations.profile.labelAge + '</dt><dd>' + age + '</dd>'
        + '<dt>' + _self.translations.profile.labelMarital + '</dt><dd>' + maritalstatus + '</dd>'
        + '<dt>' + _self.translations.profile.labelOrientation + '</dt><dd>' + orientation + '</dd>'
        + '<dt>' + _self.translations.profile.labelLocation + '</dt><dd>' + countryFlag + '/' + contact.location + '</dd>'
        + '</dl>'
    }
};

/**
 *
 * @param cName
 * @param cVal
 * @param lifetime
 * @param domain
 */
PortalChat.prototype.setCookie = function (cName, cVal, lifetime, domain) {
    var d = new Date(),
        exdays = lifetime || 30;
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    var expires = (lifetime === false) ? 'Session' : d.toUTCString(),
        cookie = cName + '=' + cVal + '; expires=' + expires + '; path=/;';
    if(domain) {
        cookie += ' domain=' + domain + ''
    }
    document.cookie = cookie;
};

/**
 * store user settings (i.e. notification settings) in local storage
 */
PortalChat.prototype.storeSettings = function() {
    var _self = this;

    //Save settings in cookie to set open state with php
    _self.setCookie('pc-contactListOpen', _self.userSettings.contactListOpen ? 1 : 0);

    /** store conversations to local storage */
    if (typeof(Storage) !== 'undefined') {
        try {
            localStorage.setItem(_self.userId + '_portalchat-settings', JSON.stringify(_self.userSettings));
        } catch (e) {
            if (_self.debug.logging) {
                console.error('PortalChat::error \n\t' + e.message);
            }
        }
    }
};


/**
 * get user settings from local storage
 */
PortalChat.prototype.loadSettings = function() {
    var _self = this;

    if (typeof(Storage) !== 'undefined') {
        try {
            if (localStorage.getItem(_self.userId + '_portalchat-settings') != null) {
                var userSettings = localStorage.getItem(_self.userId + '_portalchat-settings');
                _self.userSettings = JSON.parse(userSettings);

                /** apply notification settings */
                if (_self.userSettings.isMuted) {
                    jQuery('.js-mute-sounds').removeClass('sounds-on').addClass('sounds-off');
                } else {
                    jQuery('.js-mute-sounds').removeClass('sounds-off').addClass('sounds-on');
                }

                /** apple contact list state */
                if (_self.userSettings.contactListOpen) {
                    jQuery('#portalchat-wrapper, #pc-conversations').addClass('open');
                    jQuery('body').addClass('sidechat-open');
                    jQuery('.js-toggle-friendlist').html('&#xf101;');
                } else {
                    jQuery('#portalchat-wrapper, #pc-conversations').removeClass('open');
                    jQuery('body').removeClass('sidechat-open');
                    jQuery('.js-toggle-friendlist').html('&#xf100;');
                }

                if (typeof _self.userSettings.showChangePriceInfo === 'undefined') {
                    _self.userSettings.showChangePriceInfo = true;
                }
            } else {
                /** no user settings, apply defaults */
                if (window.innerWidth > 1400) {
                    jQuery('#portalchat-wrapper, #pc-conversations').addClass('open');
                    jQuery('body').addClass('sidechat-open');
                    jQuery('.js-toggle-friendlist').html('&#xf101;');
                }
                jQuery('.js-mute-sounds').removeClass('sounds-off').addClass('sounds-on');
            }
        } catch (e) {
            if (_self.debug.logging) {
                console.error('PortalChat::error \n\t' + e.message);
            }
        }
    }

    if (!_self.isMobile()) {
        jQuery('.js-mute-sounds').fadeIn(300);
    }
};


/**
 * store contact list to local storage
 */
PortalChat.prototype.storeContactList = function() {
    var _self = this;

    if (typeof(Storage) !== 'undefined') {
        try {
            var contactlist = jQuery(_self.friendlists.favorites.selector).html();

            localStorage.setItem(_self.userId + '_portalchat-contactlist', contactlist);
        } catch (e) {
            if (_self.debug.logging) {
                console.error('PortalChat::error \n\t' + e.message);
            }
        }
    }
};

/**
 * create contact list from localStorage (if available) to show list as soon as possible
 */
PortalChat.prototype.loadContactlist = function() {
    var _self = this;

    if (typeof(Storage) !== 'undefined') {
        try {
            if (localStorage.getItem(_self.userId + '_portalchat-contactlist') != null) {
                var contactlist = localStorage.getItem(_self.userId + '_portalchat-contactlist');

                jQuery(_self.friendlists.favorites.selector).html(contactlist);
            }
        } catch (e) {
            if (_self.debug.logging) {
                console.error('PortalChat::error \n\t' + e.message);
            }
        }
    }
};

/**
 * load fill top amateurs list
 */
PortalChat.prototype.loadTopamateurslist = function(amateurs) {
    if(Object.keys(amateurs).length == 0){
        return;
    }

    var targetContainer = this.friendlists.favorites.selector;
    var contactList = jQuery('<ul class="pc-friendlist pc-toplist"></ul>').appendTo(targetContainer);
    var toplistBanner = jQuery('<div class="alert alert-fill clearfix"><span class="icon"><i class="fa fa-rotate-270 fa-reply"></i></span>' + this.translations.bannerTopAmateurs + '</div>');

    for(var i in amateurs){
        var topamateur = amateurs[i];

        this.createContactlistItem(topamateur, contactList);
    }

    toplistBanner.prependTo(contactList);
};

/**
 * send a message
 *
 * @param portal
 * @param recipient
 * @param message
 */
PortalChat.prototype.sendMessage = function(portal, recipient, message) {
    var _self = this;
    this.socket.emit('sendMessage', portal, recipient, message);
};



/**
 * handle status update
 *
 * @param status
 * @param portal
 * @param userId
 */
PortalChat.prototype.updateStatus = function(status, portal, userId) {
    if (portal == this.portalId && userId == this.userId) {
        this.visibility = status;
    }
    if (typeof userId !== 'undefined') {
        var targetContainer = jQuery(this.friendlists.history.selector).hasClass("active") ? this.friendlists.history.selector : this.friendlists.favorites.selector;
        var targetItem = jQuery(targetContainer + ' .pc-contactlist > li[data-contactid="' + userId + '"]');
        if (targetItem.length) {
            var currentStatus = targetItem.data('status');
            if (currentStatus != status) {
                if (status == "online") {
                    jQuery(targetContainer + ' .pc-contactlist').prepend(targetItem);
                } else if (status == "offline") {
                    jQuery(targetContainer + ' .pc-contactlist').append(targetItem);
                }
                targetItem.data('status', status);
            }

        }

        var statusBadge = jQuery('.js-status-badge-' + portal + '-' + userId);
        statusBadge.removeClass('online offline away').addClass(status).data('status', status);
    }
};

/**
 * notify user about events regarding specified conversation (i.e. new message)
 *
 * @param conversationId
 */
PortalChat.prototype.notifyConversation = function(portal, user, isOwn) {
    var _self = this;

    var conversationTab = jQuery('#conversation-tab-' + user + "-" + portal);

    conversationTab.data('modified', Date.now() );

    if (conversationTab.hasClass('minimized')) {
        conversationTab.find('.user-info > .nickname').find('.glowing').show();
    }

    if (!_self.userSettings.isMuted && !isOwn ) {
        document.getElementById('pc-notification-sound').play();
    }
    _self.fitConversations();
};


/**
 * scroll to last message in conversation, i.e. after recieving a new message
 *
 * @param appendToPortal
 * @param appendToUser
 * @param animate
 */
PortalChat.prototype.scrollToLastMsg = function(appendToPortal, appendToUser, animate) {
    var _self = this;

    animate = typeof animate !== 'undefined' ? animate : false;

    var messageList = jQuery( '#conversation-tab-' + _self.idEscape(appendToUser) + '-' + appendToPortal ).find('ul.messages');

    if (messageList.children('li').length) {
        var scrollOffset = messageList.find('li:last').offset().top - messageList.find('li:first').offset().top;

        if (animate) {
            messageList.animate({ scrollTop : scrollOffset }, 400);
        } else {
            messageList.scrollTop(scrollOffset);
        }
    }
};

/**
 * replace emoticons with equivalent images based on _self.settings.emoticons
 * i.e. :zwinker: is replaced with <img src="img/emotes/zwinker.gif">
 *
 * @param message
 */
PortalChat.prototype.replaceEmoticons = function(message) {
    var _self = this;

    var regex = new RegExp(':((\\w|\\d|\\-_)*):', 'gi');

    return message.replace(regex, function(match, iconCode) {
        if (jQuery.inArray(iconCode, _self.settings.emoticons) !== -1) {
            return '<img src="' + _self.settings.emoticonsBaseUrl + iconCode + '.gif" alt="' + iconCode + '">';
        }

        return match;
    });
};

/**
 * calculate age in years from a given date
 *
 * @param date
 * @returns {number}
 */
PortalChat.prototype.calculateAge = function(date) {
    var today = new Date(),
        birthday = new Date(date),
        age = today.getFullYear() - birthday.getFullYear(),
        month = today.getMonth() - birthday.getMonth();

    if (month < 0 || (month === 0 && today.getDate() < birthday.getDate())) {
        age--;
    }

    return age;
};

/**
 * render emoticon list items (for emoticon selector)
 */
PortalChat.prototype.getEmoticons = function() {
    var _self = this;

    var emoticons = '';

    jQuery.each(_self.settings.emoticons, function(index, emoticon) {
        emoticons += '<li><a href="javascript:void(0)"><img class="pc-emoticons-image" alt=":' + emoticon + ':" title=":' + emoticon + ':" src="' + _self.settings.emoticonsBaseUrl + emoticon + '.gif"></a></li>';
    });

    return emoticons;
};

/**
 * generate message price string
 *
 * @param price
 * @param chargingCondition
 * @param isCustomer
 * @returns {string}
 */
PortalChat.prototype.getMessagePrice = function(price, chargingCondition, isCustomer) {
    var _self = this;

    var messagePrice = '';

    if (_self.settings.virtualCurrency.factor != 1) {
        price = (price * _self.settings.virtualCurrency.factor).toFixed(2);
    }

    if (price == 0 || chargingCondition == 0) {
        messagePrice = _self.translations.messageFree;
    } else if (chargingCondition == 1 && isCustomer == 1) {
        messagePrice = _self.translations.messageFree;
    } else {
        messagePrice = price + '&nbsp;' + _self.translations.pricePerMessage;
    }

    return messagePrice;
}


/**
 * update the message price in chat window after user changes the price in his/her settings
 *
 * @param conversationId
 * @param msgPriceNew
 * @param showInfo
 */
PortalChat.prototype.updateMsgPrice = function(conversationId, msgPriceNew, showInfo) {
    var _self = this;

    _self.contactlist[conversationId].price = msgPriceNew;

    var conversation = _self.contactlist[conversationId],
        notification = '';

    if (typeof showInfo !== 'undefined' && showInfo) {
        notification = '<i class="fa fa-exclamation-triangle"></i> ';
    }

    /** calculate new message price */
    var messagePrice = '';
    if (conversation.price == 0 || conversation.chargingCondition == 0) {
        messagePrice = _self.translations.messageFree;
    } else if (conversation.chargingCondition == 1 && conversation.isCustomer == 1) {
        messagePrice = _self.translations.messageFree;
    } else {
        messagePrice = notification + conversation.price + '&nbsp;' + _self.translations.pricePerMessage;
    }

    jQuery('#conversation-tab-' + conversationId).find('.user-info > .price').html(messagePrice);
}

/**
 * Date.now() Polyfill (for IE<9)
 */
if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}

/**
 * Object.keys polyfill (for IE<9)
 */
if (!Object.keys) {
    Object.keys = function(object) {
        if (Object(object) !== object) {
            throw new TypeError('Object.keys called on non-enumerable');
        }

        var keys = [];

        for (var i in object) {
            if (object.hasOwnProperty(i)) {
                keys.push(i);
            }
        }

        return keys;
    };
}

/** String.trim for IE<9 */
if (typeof String.prototype.trim !== 'function') {
    String.prototype.trim = function() {
        return this.replace(/^\s+|\s+$/g, '');
    }
}

/**
 * escapes a given string
 *
 * @param string
 * @returns {string}
 */
PortalChat.prototype.htmlEscape = function(string) {
    return String(string)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

/*
 * escape username for save dom-id's
 * */
PortalChat.prototype.idEscape = function(username) {
    return String(username)
        .replace(/@/g, '_at_')
        .replace(/&/g, '_amp_')
        .replace(/\./g, '_dot_')
        .replace(/ /g,'_blank_');
};

/**
 * check for mobile devices
 *
 * @returns {boolean}
 */
PortalChat.prototype.isMobile = function() {
    if (navigator.userAgent.match(/Android/i)
        || navigator.userAgent.match(/webOS/i)
        || navigator.userAgent.match(/iPhone/i)
        || navigator.userAgent.match(/iPad/i)
        || navigator.userAgent.match(/iPod/i)
        || navigator.userAgent.match(/BlackBerry/i)
        || navigator.userAgent.match(/Windows Phone/i)
    ) {
        return true;
    } else {
        return false;
    }
};

PortalChat.prototype.handleFileUpload = function(portal, to, files){
    if(!files || files.length <= 0){
        return;
    }

    var file = files[0];
    _self = this;
    if (_self.settings.uploadFileTypes.indexOf(file.type) === -1) {
        alert(_self.translations.fileTypeNotAllowed)
    } else {

        var $formPanel = jQuery('#form-' + to + '-' + portal);

        $formPanel.addClass('waiting waiting-delayed');
        $formPanel.on('webkitAnimationEnd oanimationend oAnimationEnd msAnimationEnd animationend', function (e) {
            jQuery(this).removeClass('waiting-delayed');
        });


        this.socket.emit('fileUpload', portal, to, file, function (err, data) {
            $formPanel.removeClass('waiting waiting-delayed');
        });
    }
};

PortalChat.prototype.debounce = function (func, wait) {
    var timeout;
    return function() {
        if (!timeout){
            func.apply(this, arguments);
            timeout = wait;
            setTimeout(function(){
                timeout = null;
            }, wait);
        }
    };
};

PortalChat.prototype.deleteTopAmateursForUser = function(){
    var _self = this;
    if(_self.socket){
        _self.socket.emit('deleteTopAmateursForUser',function(){
            // nothing to handle here at this moment
        });
    }
}

/**
 * LinksReplacer
 * @returns {LinksReplacer}
 * @constructor
 */
var LinksReplacer = function(){

    /**
     * Replaces links for messaging system
     * @param message
     * @param replacableDomains
     * @returns {*}
     */
    this.replaceForMessaging = function(message, replacableDomains) {
        var regex = new RegExp('(((http:\/\/|ftp:\/\/|https:\/\/)|www\\.[\\w\\-_]+\\.{1}[\\w\\-_]+)+([\\w\\-\\.,@?^=%&amp;:/~\\+#]*[\\w\\-\\@?^=%&amp;/~\\+#]))', 'gi'),
            template = '<a href="$1" target="_blank">$1</a>';

        var parseUrl = function parseUrl(url) {
            if(!url.match(/^(http|ftp|https)/)){
                url = window.location.protocol.replace(':', '') + '://' + url;
            }

            var pattern = RegExp("^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?");
            var matches =  url.match(pattern);
            return {
                scheme: matches[2],
                authority: matches[4],
                path: matches[5],
                query: matches[7],
                fragment: matches[9]
            };
        };

        var matches = message.match(regex);

        for(var i in matches){
            var match = matches[i];

            var parsedUrl = parseUrl(match);
            var authorityArr = parsedUrl.authority.split('.'); // .co.uk wont work for now
            var tld = authorityArr.pop();
            var authority = authorityArr.pop();

            var pos = replacableDomains.indexOf(authority);
            if(pos !== -1){
                var newDomain = window.location.hostname;
                var newPath = (parsedUrl.path || '') + (parsedUrl.query || '') + (parsedUrl.fragment || '');

                var newUrl = parsedUrl.scheme + '://' + newDomain + newPath;

                var newTemplate = template.replace(/\$1/g, newUrl);
                message = message.replace(match, newTemplate);
            }
        }

        return message;

    }
    return this;
};
