var MessageingNotifications = function (opt, trans, tpls) {
    var that = this,
        sid,
        initialized = false,
        socket,
        defaults = {
            settings: {
                version: "1.0.0",
                socketIoPort: 8010,
                socketOptions: {},
                uid: 0,
                portalId: '',
                replacableDomains: []
            },
            translations: {},
            templates: {
                listItem: '<li><a class="js-header-message-link" data-conversation-id ="{conversationId}"  href="/messaging/#{conversationId}"><p class="message-sender"><strong>{from}</strong></p><p class="message-subject">{msg}</p></a></li>'
            },
            username: 'undefined',
            portal: 'undefined'
        },
        settings, translations, templates;

    var initSocket = function () {
        socket = io(settings.socketIoHost + ":" + settings.socketIoPort, settings.socketOptions);
    };

    var initEvents = function () {
        socket.on('connect', onSocektConnect);
        socket.on('ready', onSocektReady);
        socket.on('error', debug);
        socket.on('disconnect', debug);
        socket.on('reconnect', debug);
        socket.on('reconnect_attempt', debug);
        socket.on('reconnecting', debug);
        socket.on('reconnect_error', debug);
        socket.on('reconnect_failed', debug);
    };

    var debug = function () {
        console.log(arguments);
    };

    var onSocektConnect = function () {
        sid = socket.io.engine.id;
    };

    var onSocektReady = function () {
        if (!initialized) {
            socket.emit('getConversationsForUser', 10, 0, 'inbox', false, 'unread', function (r) {
                r.data = r.data.reverse();
                if (r.data.length > 0) {
                    var num = r.data.length > 9 ? '&gt;9' : r.data.length;
                    showCount(num);
                    addMsgToList(r.data);

                }
            });
            initialized = true;
        }
    };

    var addMsgToList = function (data) {
        var tmpl = templates.listItem;

        for (var n in data) {
            if (data.hasOwnProperty(n)) {
                var msg = data[n],
                    username = '';
                msg.users.forEach(function (user) {
                    if (user.username !== settings.username && user.portal !== settings.portal) {
                        username = user.username;
                    }
                });

                if (msg.last_message.message == '') {
                    msg.last_message.message = '<i class="message-icon fa fa-paperclip"></i>';
                } else {
                    msg.last_message.message = htmlEscape(msg.last_message.message);
                }

                var item = tmpl
                    .replace(/\{from\}/, username)
                    .replace(/\{msg\}/, msg.last_message.message)
                    .replace(/\{conversationId\}/g, msg.conversationId);

                jQuery('.header-messagelist').prepend(item);
            }
        }
    };

    var showCount = function (num) {
        jQuery('#js-header-message-count').html(num);
        jQuery('#js-header-message-count').css('display', '');
        jQuery('#js-header-envelope').removeClass('fa-envelope-o').addClass('fa-envelope');

    };

    var htmlEscape = function(string) {
        return String(string)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    var initSettings = function () {
        settings = $.extend({}, defaults.settings, opt);
        translations = $.extend({}, defaults.translations, trans);
        templates = $.extend({}, defaults.templates, tpls);
    };

    var init = function () {
        initSettings();
        initSocket();
        initEvents();
    };
    init();
};