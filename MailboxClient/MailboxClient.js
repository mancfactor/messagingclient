/**
 * Mailbox Client
 */
function MailboxClient(options) {
    this.defaults = {
        socketIoHost      : '',
        socketIoPort      : 0,
        socketOptions     : {},
        conversationLimit : 10, // how many conversations to fetch per request
        messageLimit      : 42, // how many messages to fetch per request
        directory         : 'inbox',
        archive           : false,
        emoticonsBaseUrl  : '/pubcdn/source/Global/default/img/emotes/ebebeb/',
        replaceEmoticons  : true,
        adminUser         : {
            username    : "mydirtyhobby",
            displayname : "MyDirtyHobby",
            avatar      : "http://cdn1.e11.mydirtyhobby.com/u/img/user/hashed/thumbs_86x86/5/9/0/95/95_softprofil.jpg",
            portal      : "mdh"
        },
        emoticons         : [
            'zwinker', 'abspritzen', 'anal', 'angst', 'blasen', 'cool', 'dicker_finger', 'engel', 'erstaunt', 'ficken', 'grins', 'herz', 'heul', 'kichern', 'klatschen', 'krank', 'kuss', 'lachen', 'latte', 'lecken', 'master', 'neid', 'peinlich', 'rock', 'schlafen', 'sm', 'teufel', 'titten', 'wixen', 'zunge'
        ],
        virtualCurrency: {
            name: 'DirtyCent',
            short: 'DC',
            factor: 1,
        },
        uploadFileTypes: ['image/jpeg', 'image/jpg'],
        replacableDomains : [],

        events: {
            conversationLoaded: function(){},
            msgLoaded: function(){}
        }
    };

    this.settings  = {};
    this.templates = {};

    this.socket      = null;
    this.sid         = null;
    this.currentUser = {
        username : '',
        portal   : ''
    };

    this.currentConversation = null;
    this.currentRecipient    = null;
    this.users               = {};

    this.translations = {
        dialogs : {
            deleteMessageTitle            : 'dict::deleteMessageTitle',
            deleteMessageDescription      : 'dict::deleteMessageDescription',
            deleteConversationTitle       : 'dict::deleteConversationTitle',
            deleteConversationDescription : 'dict::deleteConversationDescription',
            deleteLabelOkay               : 'dict::deleteLabelOkay',
            spamTitle                     : 'dict::spamTitle',
            spamDescription               : 'dict::spamDescription',
            spamLabelOkay                 : 'dict::spamLabelOkay',
            fileTypeNotAllowed            : 'dict::fileTypeNotAllowed'
        },
        periods : {
            now     : 'dict::now',
            decade  : 'dict::decade',
            decades : 'dict::decades',
            year    : 'dict::year',
            years   : 'dict::years',
            month   : 'dict::month',
            months  : 'dict::months',
            week    : 'dict::week',
            weeks   : 'dict::weeks',
            day     : 'dict::day',
            days    : 'dict::days',
            hour    : 'dict::hour',
            hours   : 'dict::hours',
            minute  : 'dict::minute',
            minutes : 'dict::minutes',
            second  : 'dict::second',
            seconds : 'dict::seconds'
        }
    };

    this.init(options);
}

/**
 * init mailbox client
 *
 * @param options startup parameters
 */
MailboxClient.prototype.init = function (options) {
    var _self = this;

    /**
     * die if no socket host was provided
     *
     * @todo add error handling
     */
    if (!options.socketIoHost || !options.socketIoPort) {
        throw new Error('no socket parameter provided!');
    }

    /** merge settings */
    _self.settings = jQuery.extend({}, _self.defaults, options);

    /** establish connection */
    _self.socket = io(_self.settings.socketIoHost + ":" + _self.settings.socketIoPort, _self.settings.socketOptions);

    _self.initSocketHandler();
    _self.initClickHandler();
    _self.initTemplates();
    _self.initContacts();
    if (_self.settings.current.showArchived) {
        _self.showArchive();
    } else {
        _self.showInbox();
    }
};

/**
 * handler for socket events
 */
MailboxClient.prototype.initSocketHandler = function () {
    var _self = this;

    /**
     * handle 'connected' event
     */
    _self.socket.on('connect', function (s) {
        _self.sid = _self.socket.io.engine.id;
    });

    /**
     * update current user data after connect
     */
    _self.socket.on('userConnected', function (response) {
        _self.currentUser.username = (typeof response.username !== 'undefined') ? response.username : '';
        _self.currentUser.portal   = (typeof response.portal !== 'undefined') ? response.portal : '';
    });

    /**
     * handle new message
     */
    _self.socket.on('receiveMessage', function (message, recipient) {

        if (message.source == 'system') {

            switch (message.type) {
                case 'ignorecontact':
                case 'unignorecontact':
                case 'changeprice':
                    var from_portal = message.from_portal;
                    var from        = message.from;

                    if (message.from_portal == _self.currentUser.portal && message.from == _self.currentUser.username) {
                        from_portal = message.to_portal;
                        from        = message.to;
                    }
                    if (_self.currentRecipient.portal && _self.currentRecipient.portal == from_portal && _self.currentRecipient.recipient == from) {
                        _self.updateMessageList(_self.currentConversation, from, from_portal);
                    }

                    return;

                case 'processingfailed':
                case 'processingdelayed':
                case 'msg':
                    break;

                default:
                    return;
            }
        }

        if(message.type == 'typing'){
            if((message.from != _self.currentUser.username || message.from_portal != _self.currentUser.portal) && message.conversationId == _self.currentConversation){
                jQuery(document).trigger('typingstart-mailbox', [ message.from_portal, message.from]);
            }
            return;
        }

        if (_self.settings.current.showArchived &&
            (message.conversationId == _self.currentConversation)) {
            window.setTimeout(function () {
                _self.showInbox(1);
            }, 1000);
        } else if (
            _self.settings.current.mailbox != 'inbox' ||
            _self.settings.current.showArchived == true

        ) {
            return;
        }

        var users = [
            {
                portal   : message.from_portal,
                username : message.from
            },
            {
                portal   : message.to_portal,
                username : message.to
            }
        ];
        _self.getUsersAsync(users, function () {
            jQuery(document).trigger('typingend-mailbox', [ message.from_portal, message.from ]);
            _self.appendMessage(message, recipient);
        });
    });

    /**
     * handle the online status when user login or logout
     */
    _self.socket.on('updateOnlineStatus', function (status, portal, username) {
        _self.updateStatus(status, portal, username);
    });

    /**
     * handle the online status when user set new status such as online, offline, away
     */
    _self.socket.on('updateVisibility', function (visibility, portal, username) {
        _self.updateStatus(visibility, portal, username);
    });
};

/**
 * click handler assignment for user interaction
 */
MailboxClient.prototype.initClickHandler = function () {
    var _self = this;

    jQuery('#messagingFilter').change(function (e) {
        jQuery('#messagingFilterUser').val('').trigger('chosen:updated');
        _self.settings.current.filter = jQuery(this).val();
        location.hash = '';
        _self.loadAll();
    });

    jQuery('#messagingFilterUser').change(function (e) {
        jQuery('#messagingFilter').val('').trigger('chosen:updated');
        _self.settings.current.filter = jQuery('#messagingFilter').val();
        if (jQuery(this).val() == '') {
            location.hash = '';
            _self.loadAll();
        } else {
            _self.loadSingle(jQuery(this).val());
        }
    });

    /**
     * switch conversation on hash change
     */
    jQuery(window).on('hashchange', function (e) {
        e.preventDefault();

        var hash = location.hash.replace("#", "");
        var tmp  = hash.split('|');
        if (tmp.length > 1) {
            jQuery('.js-conversation').removeClass('is-active');
            var users = [{username : tmp[1], portal : tmp[2]}];
            _self.getUsersAsync(users, function () {
                _self.updateMessageList(tmp[0], tmp[1], tmp[2]);
                jQuery('#conversation-list').find('.message[data-conversation-id="' + tmp[0] + '"]').addClass('is-active');
                _self.showConversation(tmp[0]);
            });

        } else if (tmp.length == 1 && tmp[0] != '') {
            _self.showConversation(hash);
        }

        /**
         * switch to message view (used for mobile only)
         */
        if (hash != '') {
            jQuery('#messaging-wrapper').removeClass('show-overview').addClass('show-messages');
        } else {
            jQuery('#messaging-wrapper').removeClass('show-messages').addClass('show-overview');
        }
    });

    /**
     * switch conversation on header message list click
     */
    jQuery(document).on('click', '.js-header-message-link', function (e) {
        e.preventDefault();
        var $inbox = jQuery('.messagingnav-inbox');

        /* switch to inbox load messages else get selected conversation */
        if (!$inbox.hasClass('active')) {
            jQuery('.messagingnav').removeClass('active');
            $inbox.addClass('active');
            _self.settings.current.showArchived = false;

            _self.getConversations(true, jQuery(this).data('conversation-id'));
        } else {
            _self.showConversation(jQuery(this).data('conversation-id'));
        }

        /**
         * switch to message view (used for mobile only)
         */
        jQuery('#messaging-wrapper').removeClass('show-overview').addClass('show-messages');
    });

    /**
     * load messages for conversation
     */
    jQuery(document).on('click', '.js-conversation', function (e) {
        window.location.hash = jQuery(this).data('conversation-id');
        //_self.showConversation(jQuery(this).data('conversation-id'));

        /**
         * switch to message view (used for mobile only)
         */
        jQuery('#messaging-wrapper').removeClass('show-overview').addClass('show-messages');

        window.scrollTo(0, 0);
    });

    /**
     * load more conversations
     */
    jQuery(document).on('click', '.js-conversations-load-more', function (e) {
        e.preventDefault();

        _self.settings.current.offset = jQuery('#conversation-list').find('.js-conversation').length;
        _self.getConversations(false);

        /** delete current "load-more" button */
        jQuery(this).remove();
    });

    /**
     * load more messages
     */
    jQuery(document).on('click', '.js-messages-load-more', function (e) {
        e.preventDefault();

        var conversationId = jQuery(this).data('conversation-id'),
            loadFrom       = jQuery(this).data('ts-loadfrom');

        _self.getMessagesForConversation(conversationId, loadFrom, false, false);

        /** delete current "load-more" button */
        jQuery(this).remove();
    });

    /**
     * delete conversation
     */
    jQuery(document).on('click', '.js-delete-conversation', function (e) {
        e.stopPropagation();

        var conversationId = jQuery(this).data('conversation-id');

        _self.getConfirmationModal({
                title    : _self.translations.dialogs.deleteConversationTitle,
                message  : _self.translations.dialogs.deleteConversationDescription,
                labelOkay: _self.translations.dialogs.deleteLabelOkay
            },
            function() {
                _self.socket.emit('deleteConversation', conversationId, function(response) {
                    if (response.code === 1) {
                        _self.removeConversationItem(conversationId, true);
                    }
                });
            });
    });

    /**
     * archive conversation
     */
    jQuery(document).on('click', '.js-archive-conversation', function (e) {
        e.stopPropagation();

        var conversationId = jQuery(this).data('conversation-id');

        var archiveMessage = function(){
            _self.socket.emit('archiveConversation', conversationId, function (response) {
                if (response.code === 1) {
                    _self.removeConversationItem(conversationId, true);
                }
            });
        };

        var remember = false;

        try{
            remember = JSON.parse(localStorage.getItem('mailboxArchiveRemember')) || false;
        }
        catch(e){}

        if(remember){
            archiveMessage();
            return;
        }

        _self.getConfirmationModal({
                title       : _self.translations.dialogs.archiveConversationTitle,
                message     : _self.translations.dialogs.archiveConversationDescription,
                labelOkay   : _self.translations.dialogs.archiveLabelOkay,
                template    : 'confirmationModalCheckbox',
                checkboxText: _self.translations.dialogs.archiveConversationRemember
            },
            function() {
                var $confirmationModal = jQuery(this).parents('.modal-dialog');
                var checkbox = $confirmationModal.find('.js-mailbox-confirmation-checkbox');
                var checked = checkbox.prop("checked");

                if(checked){
                    try{
                        localStorage.setItem('mailboxArchiveRemember', true);
                    }
                    catch(e){}
                }

                archiveMessage();
            });
    });

    /**
     * delete message
     */
    jQuery(document).on('click', '.js-delete-message', function (e) {
        e.preventDefault();

        var messageId      = jQuery(this).data('message-id'),
            conversationId = jQuery(this).data('conversation-id');

        _self.getConfirmationModal({
                title    : _self.translations.dialogs.deleteMessageTitle,
                message  : _self.translations.dialogs.deleteMessageDescription,
                labelOkay: _self.translations.dialogs.deleteLabelOkay
            },
            function() {
                _self.socket.emit('deleteMessage', conversationId, messageId, function(response) {
                    if (response.code === 1) {
                        _self.removeMessageItem(messageId, true);
                    }
                });
            });
    });

    /**
     * mark message as spam
     */
    jQuery(document).on('click', '.js-spam-message', function (e) {
        e.preventDefault();

        var messageId      = jQuery(this).data('message-id'),
            conversationId = jQuery(this).data('conversation-id');

        _self.getConfirmationModal({
                title    : _self.translations.dialogs.spamTitle,
                message  : _self.translations.dialogs.spamDescription,
                labelOkay: _self.translations.dialogs.spamLabelOkay
            },
            function() {
                _self.socket.emit('spamMessage', conversationId, messageId, function(response) {
                    if (response.code === 1) {
                        _self.removeMessageItem(messageId, true);
                    }
                });
            });
    });

    /**
     * report message
     * sends message details to kayako and marks message as "reported by current user" in elasticsearch
     *
     * @todo report message to kayako (with conversationId, messageId, message content, ...)
     */
    jQuery(document).on('click', '.js-report-message', function (e) {
        e.preventDefault();

        var messageId      = jQuery(this).data('message-id'),
            conversationId = jQuery(this).data('conversation-id');

        /** open report modal */
        var $reportModal = jQuery(_self.templates.messageReportModal({
            messageId      : messageId,
            conversationId : conversationId
        }));

        $reportModal.appendTo('body').modal({
            backdrop : true,
            keyboard : true
        });

        $reportModal.on('hidden.bs.modal', function () {
            jQuery(this).remove();
        });

        /**
         * check for report message
         */
        $reportModal.on('keyup paste', '#report-message', function (e) {
            var inputOkay = (jQuery(this).val().length < 10);

            jQuery('.js-submit-message-report').prop('disabled', inputOkay);
        });

        /** bind report action to report form submit */
        $reportModal.on('click', '.js-submit-message-report', function () {
            _self.socket.emit('reportMessage', conversationId, messageId, jQuery('#report-message').val(), function (response) {
                if (response.code === 1) {
                    $reportModal.modal('hide');

                    _self.removeMessageItem(messageId, true);
                }
            });
        });
    });

    /**
     * send message
     *
     * @todo add (disabled) preliminary message (with tracking number) to message list
     */
    jQuery(document).on('submit', '#message-send-form', function (e) {
        e.preventDefault();

        var recipientId       = jQuery(this).data('recipient-id'),
            recipientPortalId = jQuery(this).data('recipient-portalid'),
            message           = jQuery('#message-input').val().trim();

        if (message.length > 0) {
            _self.sendMessage(recipientPortalId, recipientId, message, function () {
                /** clear input and set focus */
                jQuery('#message-input').val('');
            });
        }
    });

    var sendDebouncedTypingMessage = this.debounce(function(portal, recipient){
        _self.socket.emit('typing', portal, recipient);
    }, 1000, true);

    /** submit message on <ctrl> + <enter> or <cmd> + <enter> */
    jQuery(document).on('keydown', '#message-input', function (e) {
        if (e.which == 13 && (e.ctrlKey || e.metaKey)) {
            jQuery('#message-send-form').submit();
        }
        else{
            var recipient = jQuery(this).parents('form').data('recipient-id');
            var portal = jQuery(this).parents('form').data('recipient-portalid');
            sendDebouncedTypingMessage(portal, recipient);
        }
    });

    /**
     * send attachments
     */
    jQuery(document).on('change', '.js-upload-file', function (e) {
        e.preventDefault();
        var input = this,
            files = input.files,
            allowUploading = true,
            i = 0,
            l = files.length;

        for (; i < l; i++) {
            var f = files[i];
            if(_self.settings.uploadFileTypes.indexOf(f.type) === -1){
                allowUploading = false;
            }
        }

        if(allowUploading){
            _self.showUploadPreview(files);
        } else {
            alert(_self.translations.dialogs.fileTypeNotAllowed)
        }
    });

    /**
     * get back to overview (mobile only)
     */
    jQuery(document).on('click', '.js-back-to-overview', function (e) {
        jQuery('#messaging-wrapper').removeClass('show-messages').addClass('show-overview');
    });

    /**
     * open file upload (button acts as a proxy so "attach files"-button can be styled)
     */
    jQuery(document).on('click', '.js-trigger-upload', function (e) {
        e.preventDefault();
        jQuery('.js-upload-file').val('');
        jQuery('.js-upload-file').trigger('click');
    });

    /** @todo experimental! resize textarea on input */
        //var input = document.getElementById('message-input');
        //
        //jQuery(document).on('keydown', '#message-input', function(e) {
        //    jQuery(this).data('scrollBefore', input.scrollHeight);
        //});
        //
        //jQuery(document).on('keyup', '#message-input', function(e) {
        //    jQuery(this).data('scrollAfter', input.scrollHeight);
        //
        //    var scrollHeightA = jQuery(this).data('scrollBefore'),
        //        scrollHeightB = jQuery(this).data('scrollAfter'),
        //        currentRows   = parseInt(jQuery(this).attr('rows'));
        //
        //    if (scrollHeightB > scrollHeightA) {
        //        jQuery(this).attr('rows', currentRows + 1);
        //    } else if (scrollHeightA > scrollHeightB) {
        //        jQuery(this).attr('rows', currentRows - 1);
        //    }
        //
        //    cnsole.log('currentRows: %s, scrollHeightA: %s, scrollHeightB: %s', currentRows, scrollHeightA, scrollHeightB);
        //});

    jQuery(document).on('click', '.js-ignore-recipient', function (e) {
        e.preventDefault();

        var targetUrl = jQuery(this).attr('href'),
            icon      = jQuery(this).find('.fa');

        if (confirm(jQuery(this).attr('title'))) {
            icon.removeClass('fa-user-times').addClass('fa-spinner fa-spin');

            jQuery.get(targetUrl, null, function (response) {
                icon.removeClass('fa-spinner fa-spin').addClass('fa-user-times');
            });
        }
    });

    /** fix positioning on mobile devices */
    if (Modernizr.touchevents) {
        var $messageInput = jQuery('#message-input');

        $messageInput.on('focus', function () {
            jQuery('.mailbox').addClass('push-footer');
        });

        $messageInput.on('blur', function () {
            jQuery('html, body').animate({
                scrollTop : 0
            }, 300, 'swing', function () {
                jQuery('.mailbox').removeClass('push-footer');
            });
        });
    }

    /**
     * handle attachment confirmation
     */
    _self.confirmUpload = function () {
        var btn = this;
        jQuery(btn).off('click', _self.confirmUpload);
        btn.parentElement.className += ' uploadProcess';

        var $messageForm    = jQuery('#message-send-form'),
            recipient       = $messageForm.data('recipient-id'),
            recipientPortal = $messageForm.data('recipient-portalid'),
            file            = document.getElementById('upload-file');
        _self.handleFileUpload(recipientPortal, recipient, file.files);
    };

    /**
     * handle attachment cancelation
     */
    jQuery(document).on('click', '.js-cancel-upload', function (e) {
        _self.clearUploadPreview();
    });

    jQuery(document).on('typingstart-mailbox', function(e, portal, username){
        var $messageList = jQuery('#conversation-messages');

        var timeout = $messageList.data('timeout');

        if(timeout){
            clearTimeout(timeout);
            $messageList.data('timeout', null);
            var $messageList = jQuery('#conversation-messages');
            $messageList.find('.js-message-typing').remove();
        }

        var id = portal + '-' + username;
        $messageList.append(_self.templates.messageItemTyping({portal: portal, from: username, 'id': id}));
        _self.scrollToMessage(id);

        timeout = setTimeout(function(){
            jQuery(document).trigger('typingend-mailbox', [ portal, username ]);
        }, 2000);

        $messageList.data('timeout', timeout);
    });

    jQuery(document).on('typingend-mailbox', function(e, portal, username){
        var $messageList = jQuery('#conversation-messages');
        $messageList.find('.js-message-typing').remove();
    });
};

/**
 * fetch additional data for given user (i.e. profile information)
 *
 * @param userId
 * @param portalId
 */
MailboxClient.prototype.getUserData = function (userId, portalId) {
    if (this.users.hasOwnProperty(portalId) && this.users[portalId].hasOwnProperty(userId)) {
        return this.users[portalId][userId];
    }
    return {};
};

MailboxClient.prototype.getUsersAsync = function (users, cb) {

    _self = this;

    if (users.length == 0) {
        cb();
        return;
    }

    user = users.pop();

    if (this.users.hasOwnProperty(user.portal) && this.users[user.portal].hasOwnProperty(user.username)) {
        _self.getUsersAsync(users, cb);
        return;
    }

    _self.socket.emit('getContact', user.portal, user.username, function (data) {
        if (!_self.users.hasOwnProperty(user.portal)) {
            _self.users[user.portal] = {};
        }
        if (!data.hasOwnProperty('displayname')) {
            data.displayname = data.nick;
        }
        _self.users[user.portal][user.username] = data;
        _self.getUsersAsync(users, cb);
    });

};

MailboxClient.prototype.initContacts = function () {
    var _self = this;
    _self.socket.emit('getMessageHistoryUsers', function (response) {
        if (response.code == 1) {

            var compare = function (a, b) {

                var aNick = a.nick.toLowerCase(),
                    bNick = b.nick.toLowerCase();

                if (aNick < bNick) {
                    return -1;
                }

                if (aNick > bNick) {
                    return 1;
                }

                return 0;
            };

            _self.updateUserFilter(response.data.sort(compare));
        }
    });
};

MailboxClient.prototype.loadAll = function () {
    var _self = this;
    jQuery('#conversation-list').html('');
    _self.settings.current.offset = 0;

    var conversationId;
    var showRecent = true;

    /* if hash is existing us it to preselect conversation */
    var hash = location.hash.replace("#", "");
    if (hash.length > 0) {
        var tmp = hash.split('|');
        if (tmp.length > 1) {
            showRecent = false;

            conversationId = tmp[0];
            var users      = [{username : tmp[1], portal : tmp[2]}];
            _self.getUsersAsync(users, function () {
                _self.updateMessageList(conversationId, tmp[1], tmp[2]);
                _self.showConversation(tmp[0]);
            });

        } else {
            conversationId = hash;
        }

    }
    if (_self.isMobile()) {
        showRecent = false;
    }
    this.getConversations(showRecent, conversationId);
};

MailboxClient.prototype.loadSingle = function (conversationId) {
    var _self = this;
    jQuery('#conversation-list').html('');

    _self.socket.emit('getConversation', conversationId, function (response) {
        if (response.code === 1) {

            var $conversationList = jQuery('#conversation-list');
            // ensure all userdata is present
            var users             = Object.assign([], response.data.users);
            _self.getUsersAsync(users, function () {

                response.data = _self.addUserdataToConversation([response.data]);

                var isArchivedMessage = false;
                response.data[0].archived.forEach(function (user, index) {
                    if (user.portal == _self.currentUser.portal && user.username == _self.currentUser.username) {
                        isArchivedMessage = true;
                    }
                });

                if (isArchivedMessage && !_self.settings.current.showArchived) {
                    jQuery('.messagingnav').removeClass('active');
                    jQuery('.messagingnav-archive').addClass('active');
                    _self.settings.current.showArchived = true;
                } else if (!isArchivedMessage && _self.settings.current.showArchived) {
                    jQuery('.messagingnav').removeClass('active');
                    jQuery('.messagingnav-inbox').addClass('active');
                    _self.settings.current.showArchived = false;
                }

                response.data[0].showArchived = _self.settings.current.showArchived;

                /** check if unread */
                response.data[0].read.forEach(function (user) {
                    if (user.portal == _self.currentUser.portal && user.username == _self.currentUser.username) {
                        response.data[0].isRead = true;
                    }
                });

                $conversationList.append(_self.templates.conversationList({
                    conversations     : response.data,
                    conversationCount : 0,
                    currentMailbox    : _self.settings.current.mailbox,
                    showArchived      : _self.settings.current.showArchived
                }));

                if (!_self.isMobile()) {
                    _self.showConversation(response.data[0].conversationId);
                }

            });

        }
    });
};

MailboxClient.prototype.updateMessageList = function (conversationId, username, portal) {
    var _self = this;
    _self.socket.emit('getContact', portal, username, function (data) {
        _self.updateMessagePrice(data);
        _self.updateConversationHeader(data);
        if (conversationId) {
            _self.updateMessageForm(data, conversationId);
        }
    });
};

MailboxClient.prototype.showInbox = function (reset) {
    if (reset) {
        location.hash = '';
    }
    jQuery('.messagingnav').removeClass('active');
    jQuery('.messagingnav-inbox').addClass('active');

    /** show "old inbox" button */
    if (jQuery('.js-old-inbox').length) {
        jQuery('#filter-bar').find('.col-xs-4').toggleClass('col-xs-4 col-xs-6');
        jQuery('.js-old-inbox').hide();
    }

    var _self                           = this;
    _self.settings.current.showArchived = false;
    _self.loadAll();
    jQuery('#messagingFilterUser').prop('selectedIndex', 0);
};

MailboxClient.prototype.showArchive = function (reset) {
    if (reset) {
        location.hash = '';
    }
    jQuery('.messagingnav').removeClass('active');
    jQuery('.messagingnav-archive').addClass('active');

    /** show "old inbox" button */
    if (jQuery('.js-old-inbox').length) {
        jQuery('#filter-bar').find('.col-xs-6').toggleClass('col-xs-4 col-xs-6');
        jQuery('.js-old-inbox').show();
    }

    var _self                           = this;
    _self.settings.current.showArchived = true;
    _self.loadAll();
    jQuery('#messagingFilterUser').prop('selectedIndex', 0);
};

/**
 * get all conversations for current user
 *
 * @param showRecent    show messages of most-recent conversation after fetching conversations (i.e. on init)
 * @param conversationId show message selected by url hash
 */
MailboxClient.prototype.getConversations = function (showRecent, conversationId) {
    var _self = this;

    _self.socket.emit('getConversationsForUser', _self.settings.conversationLimit, _self.settings.current.offset, _self.settings.current.mailbox, _self.settings.current.showArchived, _self.settings.current.filter, function (response) {
        var $conversationList = jQuery('#conversation-list');
        if (response.code === 11) {
            var hash = location.hash.replace("#", "");

            $conversationList.html(_self.templates.conversationList({
                noConversations : true,
                currentMailbox  : _self.settings.current.mailbox,
                showArchived    : _self.settings.current.showArchived
            }));
            if(hash.length == 0){
                document.getElementById('messages-list').style.display = 'none';
            }
            return;
        }
        document.getElementById('messages-list').style.display = '';

        if (response.code === 1) {

            jQuery.extend(true, _self.users, response.users);

            response.total = response.total - _self.settings.conversationLimit;
            response.data  = _self.addUserdataToConversation(response.data);

            for (n in response.data) {
                if (response.data.hasOwnProperty(n)) {
                    response.data[n].showArchived = _self.settings.current.showArchived;
                    response.data[n].isRead       = false;

                    if (typeof response.data[n].recipients[0] != 'undefined') {
                        if (response.data[n].recipients[0].nick == _self.settings.adminUser.username && response.data[n].recipients[0].portal == _self.settings.adminUser.portal) {
                            response.data[n].recipients[0].displayname = _self.settings.adminUser.displayname;
                            response.data[n].recipients[0].avatar      = _self.settings.adminUser.avatar;
                            response.data[n].recipients[0].avatarHc    = _self.settings.adminUser.avatarHc || _self.settings.adminUser.avatar;
                        } else {
                            response.data[n].recipients[0].displayname = response.data[n].recipients[0].nick;
                        }
                    }

                    /** check if unread */
                    response.data[n].read.forEach(function (user) {
                        if (user.portal == _self.currentUser.portal && user.username == _self.currentUser.username) {
                            response.data[n].isRead = true;
                        }
                    });
                }
            }

            $conversationList.append(_self.templates.conversationList({
                conversations     : response.data,
                conversationCount : (response.total > 0) ? response.total : 0,
                currentMailbox    : _self.settings.current.mailbox,
                showArchived      : _self.settings.current.showArchived,
                showLoadMoreConversations      : (response.total > 0 && response.data.length == _self.settings.conversationLimit)
            }));

            if (showRecent) {
                if (typeof conversationId !== "undefined") {
                    _self.showConversation(conversationId);
                } else {
                    _self.showConversation(response.data[0].conversationId);
                }
            }

            //_self.updateUserFilter(response.data);
        }
    });
};

/**
 * fetch most-recent messages
 *
 * @param conversationId
 * @param tsLoadFrom        timestamp used to fetch next messages
 * @param clearMessageList  clear message list before inserting new messages
 * @param scrollToLast      scroll to last message in list
 */
MailboxClient.prototype.getMessagesForConversation = function (conversationId, tsLoadFrom, clearMessageList, scrollToLast) {
    var _self             = this,
        $conversationList = jQuery('#conversation-list'),
        $conversation     = $conversationList.find('li[data-conversation-id="' + conversationId + '"]');

    tsLoadFrom       = (typeof tsLoadFrom !== 'undefined') ? tsLoadFrom : '';
    clearMessageList = (typeof clearMessageList !== 'undefined') ? clearMessageList : false;
    scrollToLast     = (typeof scrollToLast !== 'undefined') ? scrollToLast : true;

    this.socket.emit('getMessagesForConversation', conversationId, _self.settings.messageLimit, tsLoadFrom, function (response) {
        if (response.code === 1) {
            var messages     = response.data,
                $messageList = jQuery('#conversation-messages');

            if (clearMessageList) {
                $messageList.empty();
            }

            if (messages.length) {
                /** get profile data for sender */
                messages = _self.addUserdataToMessage(messages);

                response.total = response.total - _self.settings.messageLimit;

                for (n in messages) {
                    messages[n].notown = !(messages[n].from_portal == _self.currentUser.portal && messages[n].from == _self.currentUser.username);
                }

                $messageList.prepend(_self.templates.messageList({
                    messages     : messages.reverse(),
                    messageCount : (response.total > 0) ? response.total : 0
                }));

                if (scrollToLast) {
                    _self.scrollToMessage(messages[messages.length - 1].id);
                }

                _self.settings.events.conversationLoaded();

                $conversation.addClass('is-read').removeClass('is-unread');
            } else {

                /** show "now more messages" info */
            }
        }
    });
};

/**
 * send message
 *
 * @todo add preliminary message to message-list
 */
MailboxClient.prototype.sendMessage = function (portalId, recipientId, message, cb) {
    var _self = this;

    _self.socket.emit('sendMessage', portalId, recipientId, message, function (trackingId) {
        if (typeof cb != 'undefined') {
            // handle trackingId
            cb(trackingId);
        }
    });
};

/**
 * takes a message object, updates to relevant conversation item and appends it to the messages list if the relevant conversation is active
 *
 * @param message
 */
MailboxClient.prototype.appendMessage = function (message, user) {

    var _self              = this,
        updateConversation = true;

    if (message.source == 'system') {
        updateConversation = false;

        switch (message.type) {
            case 'processingfailed':
                message.messageStatus = 'is-failed';
                message.failed        = true;

                break;

            case 'processingdelayed':
                message.messageStatus = 'is-delayed';
                message.failed        = true;

                break;
            default:
                break;
        }
    }

    /** if conversation is active show message in thread */
    if (message.conversationId == _self.currentConversation) {
        var $messageList = jQuery('#conversation-messages');

        message.notown = !(message.from_portal == _self.currentUser.portal && message.from == _self.currentUser.username);

        message = _self.addUserdataToMessage(message);

        var exists = $messageList.find('.message[data-client-id="' + message.client_id + '"]');
        if (exists.length > 0) {
            exists.before(_self.templates.messageItem(message));
            exists.remove();
        } else {
            $messageList.append(_self.templates.messageItem(message));
            _self.scrollToMessage(message.id, true);
        }
        _self.settings.events.msgLoaded();
    }

    /**
     * update user list with new recipient
     */
    _self.users[user.portal][user.username] = user;

    var conversation = {
        conversationId : message.conversationId,
        users          : [
            {
                username : message.from,
                portal   : message.from_portal
            },
            {
                username : message.to,
                portal   : message.to_portal
            }
        ],
        last_message   : message
    };

    /**
     * update conversation item, pull conversation up to first place in list
     */
    if (updateConversation) {
        _self.updateConversationItem(conversation);
    }
};

/**
 *
 * @param messageId message to scroll to
 * @param animate   animate scrolling, default: false
 *
 * @todo scroll offset is not computed correctly if attachments are not yet loaded
 */
MailboxClient.prototype.scrollToMessage = function (messageId, animate) {
    var $messageList   = jQuery('#conversation-messages'),
        $targetMessage = $messageList.find('li:last'), //find('.message[data-message-id="' + messageId + '"]'),
        scrollOffset   = $targetMessage.offset().top - $messageList.find('li:first').offset().top;

    if (animate) {
        $messageList.animate({scrollTop : scrollOffset}, 400);
    } else {
        $messageList.scrollTop(scrollOffset);
    }
};

/**
 * 'enriches' messages with the sender's profile information
 *
 * @param messages
 * @returns {*}
 */
MailboxClient.prototype.addUserdataToMessage = function (messages) {
    var _self = this;

    if (Array.isArray(messages)) {
        messages.forEach(function (message, index, messages) {
            messages[index].senderData = _self.getUserData(message.from, message.from_portal);
        });
    } else {
        messages.senderData = _self.getUserData(messages.from, messages.from_portal);
    }

    return messages;
};

/**
 * 'enriches' conversations with the sender's profile information
 *
 * @param conversations
 * @returns {*}
 */
MailboxClient.prototype.addUserdataToConversation = function (conversations) {
    var _self = this;

    conversations.forEach(function (conversation, conversationIndex, conversations) {
        var recipients = [];

        conversation.users.forEach(function (user) {
            if (user.username !== _self.currentUser.username || (user.username === _self.currentUser.username && user.portal !== _self.currentUser.portal)) {
                recipients.push(_self.getUserData(user.username, user.portal));
            }
        });

        conversations[conversationIndex].recipients = recipients;
    });

    return conversations;
};

/**
 *
 * @param user
 */
MailboxClient.prototype.updateConversationHeader = function (recipient) {
    var _self               = this,
        $conversationHeader = jQuery('#conversation-header');

    if (recipient.username == _self.settings.adminUser.username && recipient.portal == _self.settings.adminUser.portal) {
        recipient.displayname = _self.settings.adminUser.displayname;
        recipient.avatar      = _self.settings.adminUser.avatar;
        recipient.avatarHc    = _self.settings.adminUser.avatar;
        recipient.isAdmin     = true;
    } else {
        recipient.displayname = recipient.nick;
        recipient.isAdmin     = false;
    }

    var headerTemplate = _self.templates.conversationHeader(recipient);

    if ($conversationHeader.length) {
        jQuery('#conversation-header').replaceWith(headerTemplate);
    } else {
        jQuery('#messages-list').prepend(headerTemplate);
    }
};

/**
 * get messages for most recent conversation, i.e. on init or after archiving conversation
 */
MailboxClient.prototype.showConversation = function (conversationId) {

    var _self         = this,
        $conversation = jQuery('#conversation-list').find('li[data-conversation-id="' + conversationId + '"]'),
        recipient     = _self.getUserData($conversation.data('recipient-id'), $conversation.data('recipient-portalid'));

    _self.currentConversation = conversationId;
    _self.currentRecipient    = {
        portal    : $conversation.data('recipient-portalid'),
        recipient : $conversation.data('recipient-id')
    };

    _self.markConversationAsActive(conversationId);

    /** update message price information */
    _self.updateMessagePrice(recipient);

    /** update conversation header with current recipient's data */
    _self.updateConversationHeader(recipient);

    /** update message send form with new recipient data */
    _self.updateMessageForm(recipient, conversationId);

    /** fetch & display recent messages for conversation*/
    _self.getMessagesForConversation(conversationId, '', true, true);

    /**
     * switch to message view (used for mobile only)
     */
    if (location.hash.replace("#", "") != '') {
        jQuery('#messaging-wrapper').removeClass('show-overview').addClass('show-messages');
    }

};

/**
 * update conversation with new content like timestamps or content
 */
MailboxClient.prototype.updateConversationItem = function (conversation) {
    var _self = this;

    conversation = _self.addUserdataToConversation([conversation]);

    if (conversation[0].recipients[0].nick == _self.settings.adminUser.username && conversation[0].recipients[0].portal == _self.settings.adminUser.portal) {
        conversation[0].recipients[0].displayname = _self.settings.adminUser.displayname;
        conversation[0].recipients[0].avatar      = _self.settings.adminUser.avatar;
        conversation[0].recipients[0].avatarHc    = _self.settings.adminUser.avatar;
    } else {
        conversation[0].recipients[0].displayname = conversation[0].recipients[0].nick;
    }

    jQuery('#conversation-list .alert').hide();
    _self.removeConversationItem(conversation[0].conversationId);
    jQuery('#conversation-list').prepend(_self.templates.conversationItem(conversation[0]));
    _self.markConversationAsActive(conversation[0].conversationId);
};

/**
 * highlights conversation as active
 *
 * @param conversation
 */
MailboxClient.prototype.markConversationAsActive = function (conversationId) {
    var _self         = this,
        $conversationList = jQuery('#conversation-list'),
        $conversation = $conversationList.find('li[data-conversation-id="' + conversationId + '"]')

    if ($conversation.length) {
        jQuery('.js-conversation').removeClass('is-active');
        $conversation.addClass('is-active');
        if(!_self.isMobile() && (_self.currentConversation == conversationId)){
            $conversation.addClass('is-read').removeClass('is-unread');
        }

        $conversationList.css('display', '')
        document.getElementById('messages-list').style.display = '';
        if (typeof portalChatApi != 'undefined' && typeof portalChatApi.removeNotificationHeaderMessage != 'undefined') {
            portalChatApi.removeNotificationHeaderMessage(conversationId);
        } else {
            _self.removeNotificationHeaderMessage(conversationId);
        }
    }
};

/**
 * removes a conversation item from the dom
 *
 * @param conversationId
 * @param fadeOut
 */
MailboxClient.prototype.removeConversationItem = function (conversationId, fadeOut) {
    var $conversation = jQuery('.js-conversation[data-conversation-id="' + conversationId + '"]');

    if (fadeOut) {
        $conversation.fadeOut(250, function () {
            jQuery(this).remove();
        });
    } else {
        $conversation.remove();
    }

    if ($conversation.hasClass('is-active')) {
        $conversation.next('.js-conversation').trigger('click');
    }
};

/**
 * removes a message item from the dom
 *
 * @param messageId
 * @param fadeOut
 */
MailboxClient.prototype.removeMessageItem = function (messageId, fadeOut) {
    var $message = jQuery('.js-message[data-message-id="' + messageId + '"]');

    if (fadeOut) {
        $message.fadeOut(250, function () {
            jQuery(this).remove();
        });
    } else {
        $message.remove();
    }
};

/**
 *
 * @param user
 */
MailboxClient.prototype.updateMessagePrice = function (user) {
    var _self        = this,
        messagePrice = 0;

    if (user.price == 0 || user.chargingCondition == 0) {
        messagePrice = 0;
    } else if (user.chargingCondition == 1 && user.isCustomer == 1) {
        messagePrice = 0;
    } else {
        messagePrice = user.price;
    }

    if (messagePrice != 0 && _self.settings.virtualCurrency.factor != 1) {
        messagePrice = (messagePrice * _self.settings.virtualCurrency.factor).toFixed(2);
    }

    jQuery('.js-msg-price').html(_self.templates.messagePrice({
        price : messagePrice
    }));
};

/**
 *
 * @param recipient
 * @param conversationId
 */
MailboxClient.prototype.updateMessageForm = function (recipient, conversationId) {
    var _self        = this,
        $messageForm = jQuery('#message-send-form');

    if (recipient.username == _self.settings.adminUser.username && recipient.portal == _self.settings.adminUser.portal) {
        jQuery('.messaging-adminhide').hide();
    } else {
        jQuery('.messaging-adminhide').show();
    }

    $messageForm.data('conversation-id', conversationId);
    $messageForm.data('recipient-id', recipient.username);
    $messageForm.data('recipient-portalid', recipient.portal);

    /** clear message input */
    $messageForm.find('textarea').val('');
};

/**
 *
 * @param users
 */
MailboxClient.prototype.updateUserFilter = function (msgHistoryUsers) {
    var _self = this;
    jQuery('#messagingFilterUser').append(_self.templates.userFilterItems({
        msgHistoryUsers : msgHistoryUsers
    })).trigger('chosen:updated');
};

/**
 * show preview of uploaded file to let the user cancel or confirm the attachment
 *
 * @param files
 */
MailboxClient.prototype.showUploadPreview = function (files) {
    if (!files || files.length <= 0) {
        return;
    }

    var _self = this;

    /** show overlay while uploading */
    var formPanel = document.getElementById('message-send-form');

    formPanel.classList.add('waiting', 'waiting-delayed');
    formPanel.addEventListener('animationend', function () {
        formPanel.classList.remove('waiting-delayed');
    });

    /** get files and show preview */
    var previewImage = document.getElementById('upload-preview'),
        fileReader   = new FileReader();

    previewImage.file = files[0];

    fileReader.onload = (function (image) {
        return function (e) {
            image.src = e.target.result;
        };
    })(previewImage);

    fileReader.readAsDataURL(files[0]);

    /** show preview panel */
    document.getElementById('upload-preview-wrapper').classList.add('in');
    jQuery('.js-confirm-upload').on('click', _self.confirmUpload);
};

/**
 * clear upload preview
 */
MailboxClient.prototype.clearUploadPreview = function () {
    var _self = this;
    var wrapper = document.getElementById('upload-preview-wrapper');

    /** clear image src and force re-paint */
    document.getElementById('upload-preview').src = '';
    jQuery('.js-confirm-upload').off('click', _self.confirmUpload);
    wrapper.className = wrapper.className.replace(' uploadProcess', '');

    document.getElementById('message-send-form').classList.remove('waiting', 'waiting-delayed');
    document.getElementById('upload-preview-wrapper').classList.remove('in');
};

/**
 *
 * @param portalId
 * @param recipientId
 * @param files
 */
MailboxClient.prototype.handleFileUpload = function (portalId, recipientId, files) {
    if (!files || files.length <= 0) {
        return;
    }
    var _self = this,
        file  = files[0];
    _self.socket.emit('fileUpload', portalId, recipientId, file, function (err, data) {
        _self.clearUploadPreview();
    });
};

MailboxClient.prototype.replaceEmoticons = function (message) {
    var _self = this;

    var regex = new RegExp(':((\\w|\\d|\\-_)*):', 'gi');

    return message.replace(regex, function (match, iconCode) {
        if (jQuery.inArray(iconCode, _self.settings.emoticons) !== -1) {
            return '<img src="' + _self.settings.emoticonsBaseUrl + iconCode + '.gif" alt="' + iconCode + '">';
        }

        return match;
    });
};

MailboxClient.prototype.replaceLinks = function (message) {

    // do not replace links in html messages that already contain link tags
    if (message.match(/<a/)) {
        return message;
    }

    var regex    = new RegExp('(((http|ftp|https:\/\/)|www\\.[\\w\\-_]+\\.{1}[\\w\\-_]+)+([\\w\\-\\.,@?^=%&amp;:/~\\+#]*[\\w\\-\\@?^=%&amp;/~\\+#]))', 'gi'),
        template = '<a href="$1" target="_blank">$1</a>';

    return message.replace(regex, template);
};

/**
 * escapes a given string
 *
 * @param string
 * @returns {string}
 */
MailboxClient.prototype.htmlEscape = function (string) {
    return String(string)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

/**
 * removes html tags for a given string
 *
 * @param string
 * @returns {string}
 */
MailboxClient.prototype.htmlRemove = function (string) {
    var regEx = /<.*?>/g;
    string    = string.replace(regEx, '');
    return string;
};

/**
 * renders a confirmation modal and utilizes callback functions to react on user input
 *
 * @param options
 * @param callbackOkay
 * @param callbackCancel
 */
MailboxClient.prototype.getConfirmationModal = function (options, callbackOkay, callbackCancel) {
    var _self = this;
    options.title = options.title || '';
    options.message = options.message || '';
    options.labelOkay = options.labelOkay || '';
    var template = options.template || null;

    if(typeof _self.templates[template] === 'undefined'){
        template = _self.templates.confirmationModal;
    }
    else{
        template = _self.templates[template];
    }

    callbackCancel = (typeof callbackCancel == 'function') ? callbackCancel : function () {
        return undefined
    };

    var $confirmationModal = jQuery(template(options));

    $confirmationModal.appendTo('body').modal({
        backdrop : true,
        keyboard : true
    });

    $confirmationModal.on('hidden.bs.modal', function () {
        callbackCancel();
        jQuery(this).remove();
    });

    $confirmationModal.find('.js-mailbox-confirmation-cancel').on('click', callbackCancel);
    $confirmationModal.find('.js-mailbox-confirmation-okay').on('click', callbackOkay);
};

/**
 * compile handlebar templates
 */
MailboxClient.prototype.initTemplates = function () {
    var _self = this;

    _self.templates.conversationHeader = Handlebars.compile(document.getElementById('hbs-mailbox-conversation-header').innerHTML);

    _self.templates.messageList = Handlebars.compile(document.getElementById('hbs-mailbox-message-list').innerHTML);
    _self.templates.messageItem = Handlebars.compile(document.getElementById('hbs-mailbox-message-item').innerHTML);
    _self.templates.messageItemTyping = Handlebars.compile(document.getElementById('hbs-mailbox-message-item-typing').innerHTML);

    _self.templates.conversationList = Handlebars.compile(document.getElementById('hbs-mailbox-conversation-list').innerHTML);
    _self.templates.conversationItem = Handlebars.compile(document.getElementById('hbs-mailbox-conversation-item').innerHTML);

    _self.templates.messagePrice    = Handlebars.compile(document.getElementById('hbs-mailbox-pricetag').innerHTML);
    _self.templates.messageResponse = Handlebars.compile(document.getElementById('hbs-mailbox-message-response').innerHTML);

    _self.templates.messageReportModal = Handlebars.compile(document.getElementById('hbs-mailbox-report-message').innerHTML);

    _self.templates.confirmationModal = Handlebars.compile(document.getElementById('hbs-mailbox-confirmation-modal').innerHTML);
    _self.templates.confirmationModalCheckbox = Handlebars.compile(document.getElementById('hbs-mailbox-confirmation-modal-checkbox').innerHTML);

    _self.templates.userFilterItems = Handlebars.compile('{{#each msgHistoryUsers}}<option value="{{conversationId}}">{{nick}}</option>{{/each}}');

    Handlebars.registerPartial('avatar', document.getElementById('hbs-mailbox-avatar-partial').innerHTML);
    Handlebars.registerPartial('messageItem', document.getElementById('hbs-mailbox-message-item').innerHTML);
    Handlebars.registerPartial('messageItemTyping', document.getElementById('hbs-mailbox-message-item-typing').innerHTML);
    Handlebars.registerPartial('conversationItem', document.getElementById('hbs-mailbox-conversation-item').innerHTML);

    Handlebars.registerPartial('messageResponse', document.getElementById('hbs-mailbox-message-response').innerHTML);

    /**
     * format unix timestamps
     */
    Handlebars.registerHelper('formatDate', function (timestamp) {
        /** make timestamp conform with es specification */
        timestamp = timestamp.replace(/-/g, '/');

        return new Date(timestamp + ' GMT').toLocaleString();
    });

    /**
     * replace emoticons, escape html, ...
     */
    Handlebars.registerHelper('messageBodyProcessing', function (s, from_portal, from, htmlRemove) {
        if (from_portal == _self.settings.adminUser.portal && from == _self.settings.adminUser.username) {
            s = _self.replaceLinks(s);
        }  else if (htmlRemove) {
            s = _self.htmlRemove(s);
        } else {
            s = _self.htmlEscape(s);
        }

        if (typeof LinksReplacer == 'function') {
            var linksReplacer = new LinksReplacer();
            s                 = linksReplacer.replaceForMessaging(s, _self.settings.replacableDomains);
        }
        s = _self.replaceEmoticons(s);
        return new Handlebars.SafeString(s);
    });

    Handlebars.registerHelper('allowHtml', function (s) {
        return new Handlebars.SafeString(s);
    });

    Handlebars.registerHelper('nickmapper', function (portal, username) {
        if (portal == _self.settings.adminUser.portal && username == _self.settings.adminUser.username) {
            return _self.settings.adminUser.displayname;
        }
        return username;
    });

    /**
     * convert time to twitter / facebook style, i.e. "1 month, 5 days ago"
     *
     * inspired by: http://stackoverflow.com/questions/6679010/converting-a-unix-time-stamp-to-twitter-facebook-style
     *
     * @param timestamp     time to format
     * @param precision     how many 'places' the output should have, i.e precision = 2  --> "1 month, 5 days ago"
     *
     * @return string
     */
    Handlebars.registerHelper('twitterDate', function (timestamp, precision) {
        var diff       = (new Date() - new Date(timestamp.replace(/-/g, '/') + ' GMT')) / 1000,
            dateString = [];

        precision = (typeof precision !== 'number') ? 2 : precision;

        var periods = [
            {
                label       : _self.translations.periods.decade,
                labelPlural : _self.translations.periods.decades,
                multiplier  : 315360000
            },
            {
                label       : _self.translations.periods.year,
                labelPlural : _self.translations.periods.years,
                multiplier  : 31536000
            },
            {
                label       : _self.translations.periods.month,
                labelPlural : _self.translations.periods.months,
                multiplier  : 2628000
            },
            {
                label       : _self.translations.periods.week,
                labelPlural : _self.translations.periods.weeks,
                multiplier  : 604800
            },
            {
                label       : _self.translations.periods.day,
                labelPlural : _self.translations.periods.days,
                multiplier  : 86400
            },
            {
                label       : _self.translations.periods.hour,
                labelPlural : _self.translations.periods.hours,
                multiplier  : 3600
            },
            {
                label       : _self.translations.periods.minute,
                labelPlural : _self.translations.periods.minutes,
                multiplier  : 60
            },
            {
                label       : _self.translations.periods.second,
                labelPlural : _self.translations.periods.seconds,
                multiplier  : 1
            }
        ];

        if (diff < 5) {
            dateString.push(_self.translations.periods.now);
        } else {
            for (var i = 0; i < periods.length; i++) {
                if (diff >= periods[i].multiplier) {
                    var time  = Math.floor(diff / periods[i].multiplier),
                        label = '';

                    diff = (diff % periods[i].multiplier);

                    if (time > 1) {
                        label = periods[i].labelPlural.replace('{{value}}', time);
                    } else {
                        label = periods[i].label.replace('{{value}}', time);
                    }

                    dateString.push(label);

                    precision--;
                }

                if (precision == 0) {
                    break;
                }
            }
        }

        return dateString.join(', ');
    });

    /**
     * compute age from birthdate
     */
    Handlebars.registerHelper('getAge', function (birthday) {
        /** handle invalid dates */
        if (!birthday || birthday == '0000-00-00') {
            return 0;
        }

        var ageDate = new Date((Date.now() - new Date(birthday.replace(/-/g, '/'))));

        if (ageDate !== 'Invalid Date') {
            return Math.abs(ageDate.getUTCFullYear() - 1970);
        }

        return 0
    });

    /**
     * determine gender icon from gender string
     */
    Handlebars.registerHelper('getGenderIcon', function (genderString) {
        var genderIcon = '<i class="fa fa-fw fa-genderless"></i>';

        switch (genderString) {
            case 'F':
                genderIcon = '<i class="fa fa-fw fa-venus"></i>';
                break;
            case 'M':
                genderIcon = '<i class="fa fa-fw fa-mars"></i>';
                break;
            case 'P':
                genderIcon = '<i class="fa fa-fw fa-venus-mars"></i>';
                break;
            case 'PWW':
                genderIcon = '<i class="fa fa-fw fa-venus-double"></i>';
                break;
            case 'PMM':
                genderIcon = '<i class="fa fa-fw fa-mars-double"></i>';
                break;
            case 'TS':
            case 'SM':
                genderIcon = '<i class="fa fa-fw fa-transgender"></i>';
                break;
        }

        return new Handlebars.SafeString(genderIcon);
    });

    /**
     * build gender & age string
     */
    Handlebars.registerHelper('getAgeAndGender', function (birthday, gender) {
        var ageAndGender = '',
            age          = Handlebars.helpers.getAge(birthday),
            genderIcon   = Handlebars.helpers.getGenderIcon(gender);

        if (age) {
            ageAndGender = age + ' | ';
        }

        if (genderIcon) {
            ageAndGender += genderIcon;
        }

        return new Handlebars.SafeString(ageAndGender);
    });

    /**
     * "cast" webcam status to boolean
     */
    Handlebars.registerHelper('isOnlineWithWebcam', function (webcamStatus) {
        return (webcamStatus == 'online');
    });

    /**
     * simple debug helper
     */
    Handlebars.registerHelper('debug', function (optionalValue) {
        //cnsole.log('handlebars::current context %o', this);

        if (optionalValue) {
            //cnsole.log('handlebars::value %s', optionalValue);
        }
    });

    Handlebars.registerHelper('extendedIf', function (v1, operator, v2, options) {
        var is = false;
        switch (operator) {
            case '==':
            case '===':
                is = (v1 == v2);
            case '&&':
            case 'and':
                is = (v1 && v2);
            case '||':
            case 'or':
            default:
                is = (v1 || v2);
        }
        return (is) ? options.fn(this) : options.inverse(this)
    });

    Handlebars.registerHelper('getDisplayStatus', function (onlineStatus, visibility) {
        var displayStatus = (onlineStatus == 'online') ? visibility : 'offline';
        return new Handlebars.SafeString(displayStatus);
    });

    Handlebars.registerHelper('getLastOnline', function (onlineStatus, visibility) {
        var headerStatus = '';
        var displayStatus = Handlebars.helpers.getDisplayStatus(onlineStatus, visibility);
        switch (displayStatus.toString().toLowerCase()) {
            case 'online':
                headerStatus = ' | <span class="online">Online</span>';
                break;
            case 'away':
                headerStatus = ' | <span class="away">' + _self.translations.statusAway + '</span>';
                break;
            default:
                headerStatus = ' | <span class="offline">' + _self.translations.statusOffline + '</span>';
                break;
        }
        return new Handlebars.SafeString(headerStatus);
    });
};


MailboxClient.prototype.debounce = function (func, wait) {
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

if (typeof Object.assign != 'function') {
    Object.assign = function (target) {
        'use strict';
        if (target == null) {
            throw new TypeError('Cannot convert undefined or null to object');
        }

        target = Object(target);
        for (var index = 1; index < arguments.length; index++) {
            var source = arguments[index];
            if (source != null) {
                for (var key in source) {
                    if (Object.prototype.hasOwnProperty.call(source, key)) {
                        target[key] = source[key];
                    }
                }
            }
        }
        return target;
    };
}

MailboxClient.prototype.removeNotificationHeaderMessage = function (conversationId) {
    var _self = this;
    window.setTimeout(function () {
        jQuery('.js-header-message-link[data-conversation-id="' + conversationId + '"]').remove();
        _self.updateNotificationHeaderCount();
    }, 1000);
}

MailboxClient.prototype.updateNotificationHeaderCount = function () {
    var num = jQuery('.js-header-message-link').length;
    num     = (num > 9) ? '&gt;9' : num;
    if (num === 0) {
        jQuery('#js-header-message-count').hide();
        jQuery('#js-header-envelope').removeClass('fa-envelope-o').addClass('fa-envelope');
        jQuery('#header-messagelist-alert').show();
    } else {
        jQuery('#js-header-message-count').html(num).show();
        jQuery('#js-header-envelope').removeClass('fa-envelope-o').addClass('fa-envelope');
        jQuery('#header-messagelist-alert').hide();
    }
}

/**
 * check for mobile devices
 *
 * @returns {boolean}
 */
MailboxClient.prototype.isMobile = function() {
    if (navigator.userAgent.match(/Android/i)
        || navigator.userAgent.match(/webOS/i)
        || navigator.userAgent.match(/iPhone/i)
        || navigator.userAgent.match(/iPod/i)
        || navigator.userAgent.match(/BlackBerry/i)
        || navigator.userAgent.match(/Windows Phone/i)
    ) {
        return true;
    } else {
        return false;
    }
};

/**
 * Update the online status
 * 
 * @param string status
 * @param string portal
 * @param string username
 * @returns none
 */
MailboxClient.prototype.updateStatus = function (status, portal, username) {
    var _self = this;

    _self.socket.emit('getContact', portal, username, function (data) {
        if (!_self.users.hasOwnProperty(portal)) {
            _self.users[portal] = {};
        }
        // refresh contact info
        _self.users[portal][username] = data;

        // update the online status on header
        if (jQuery('#conversation-header').data('recipient') == username) {
            _self.updateConversationHeader(data);
        }

        // update the online status on conversation list
        jQuery('#conversation-list > li[data-recipient-id="' + username + '"] .avatar-img').removeClass('online offline away').addClass(status);
    });
};
