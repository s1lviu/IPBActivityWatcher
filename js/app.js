(function () {

    var app = angular.module('Feedr', ['ngSanitize']);

    app.controller('MainCtrl', function ($scope, $rootScope, $http, $window) {
        $rootScope.notificationsCount = 0;
        $rootScope.notificationsCounter = {
            activity : 0,
            alerts   : 0,
            inbox    : 0,
            reports  : 0
        };

        $scope.activity = [];
        $scope.app = IPBAW || {};
        $scope.app.url = $scope.app.url.replace(/\/+$/g, '');

        $scope.tab = localStorage.tab || 'alerts';
        $scope.banned = localStorage.banned || '';
        $scope.activityType = localStorage.activityType || 'content';
        $scope.notificationsEnabled = localStorage.notificationsEnabled || true;

        $scope.$watch('app', function () {
        	$rootScope.app = $scope.app;
        }, true);

        angular.forEach(['tab', 'activityType', 'notificationsEnabled'], function (resource) {
            $scope.$watch(resource, function (value) {
                if (value) {
                    localStorage[resource] = value;
                }
            });
        });

        $scope.$watch('banned', function (value) {
            if (value) {
                localStorage.banned = value;
                updateBannedUsers();
            }
        });

        $window.onfocus = function () {
            $rootScope.notificationsCounter.activity = 0;
            $rootScope.notificationsCounter[$scope.tab] = 0;
            $scope.$apply();
        };

        $rootScope.$watch('notificationsCounter', function () {
        	$scope.notificationsCount =
                $rootScope.notificationsCounter.alerts  +
                $rootScope.notificationsCounter.inbox   +
                $rootScope.notificationsCounter.reports +
                $rootScope.notificationsCounter.activity;
        }, true);

        $scope.selectTab = function (tab) {
            $scope.tab = tab;
        };

        $scope.toggleActivityType = function () {
            $scope.activityType = $scope.activityType == 'all' ? 'content' : 'all';
        };

        $scope.toggleSidebar = function () {
            $scope.displaySidebar = ! $scope.displaySidebar;
        };

        $scope.toggleBanlist = function () {
            $scope.displayBanlist = ! $scope.displayBanlist;
        };

        setInterval(checkActivity, 5000);
        checkActivity(true);

        function checkActivity(init) {
            var url = $scope.app.url + '/discover/';

            if (init) {
                $http({ method: 'GET', url: url }).then(function (res) {
                    parseInitialRequest(res.data);
                });
            } else {
                $.post(url, {
                    csrfKey: $scope.app.csrfKey,
                    after: $scope.activity.maxBy('timestamp').timestamp
                }).done(function (res) {
                    if (res.results && ! res.results.match(/There are no results to show in this activity stream yet/)) {
                        handleNewActivity(res.results);
                    }
                });
            }
        }

        function updateBannedUsers() {
            var banned = angular.copy($scope.banned).split('\n').map(function (item) { return item.trim() });

            angular.forEach($scope.activity, function (item, i) {
                $scope.activity[i].skip = item.author && banned.indexOf(item.author) > -1;
            });
        }

        function parseInitialRequest(html) {
            var userMatch = html.match(/<a href="(.*?\/profile\/.*?\/)".*?ipsUserPhoto_tiny" title="Go to .*? profile">[\s\S]*?<img src='(.*?)' alt='(.*?)' itemprop="image"/);

            angular.extend($scope.app, {
                csrfKey    : html.getMatch(/csrfKey: "(.+?)",/),
                title      : html.getMatch(/<meta property="og:site_name" content="(.+?)">/),
                shortTitle : $scope.app.shortTitle || $scope.app.title,
                user       : null
            });

            if (userMatch) {
                $scope.app.user = {
                    name   : userMatch[3],
                    url    : userMatch[1],
                    avatar : userMatch[2],
                    isMod  : html.match(/\/modcp\/reports\//)
                };
            }

            var stream = $(html.getMatch(/(<ol class=.ipsStream[\s\S]*?<\/ol>)/))
                .find('> li').not('.ipsStreamItem_time');

            stream.each(function () {
                $scope.activity.push(ContentHandler.process($(this)).get());
            });

            updateBannedUsers();
        }

        function handleNewActivity(data) {
            var stream = $('<div/>').html(data).find('> li').not('.ipsStreamItem_time');

            stream.each(function () {
                if (! window.focused && $(this).hasClass('ipsStreamItem_contentBlock')) {
                    $rootScope.notificationsCounter.activity++;
                    $scope.notificationsEnabled && notifySound.play();
                }

                $scope.activity.push(ContentHandler.process($(this)).get());
                $scope.$apply();
            });

            updateBannedUsers();
        }

        $scope.toggleTheme = function () {
            if (localStorage.theme == 'light') {
                localStorage.theme = 'dark';
            } else {
                localStorage.theme = 'light';
            }
        };

        $scope.toggleNotifications = function () {
            $scope.notificationsEnabled = ! $scope.notificationsEnabled;
        };

        $scope.$watch(function () {
            return localStorage.theme;
        }, function (theme) {
            $scope.theme = theme;
        });
    });

    app.directive('timestamp', function () {
        return {
            restrict: 'E',
            scope: {
                date: '='
            },
            replace: true,
            template: '<span>{{ timestamp }} ago</span>',
            link: function ($scope) {
                function updateTimestamp() {
                    $scope.timestamp = moment.duration(moment().diff($scope.date)).humanize();
                }

                updateTimestamp();
                setInterval(updateTimestamp, 10 * 1000);
            }

        };
    });

    app.directive('list', function ($rootScope) {
        return {
            restrict: 'E',
            scope: {
                resource: '@',
                csrfKey: '='
            },
            templateUrl: 'list.html',
            link: function ($scope) {
                var params = { app: 'core', csrfKey: $scope.csrfKey };

                $scope.list = [];
                $scope.app = IPBAW || {};

                switch ($scope.resource) {
                    case 'alerts':
                        angular.extend(params, {
                            module: 'system',
                            controller: 'notifications'
                        });
                        break;

                    case 'inbox':
                        angular.extend(params, {
                            module: 'messaging',
                            controller: 'messenger'
                        });
                        break;

                    case 'reports':
                        angular.extend(params, {
                            module: 'modcp',
                            controller: 'modcp',
                            tab: 'reports',
                            overview: 1
                        });
                        break;
                }

                function getList() {
                    $.get(IPBAW.url, params)
                        .done(function (res) {
                            var stream = $('<div/>').html(res.data || res).find('> li, > ol > li');

                            stream.each(function () {
                                $(this).addClass('user-' + $scope.resource);

                                if (! $scope.list.exists('hash', $(this).getMD5())) {
                                    if (! window.focused) {
                                        $rootScope.notificationsCounter[$scope.resource]++;
                                        $scope.notificationsEnabled && notifySound.play();
                                    }

                                    $scope.list.push(ContentHandler.process($(this)).get());
                                    $scope.$apply();
                                }
                            });
                        });
                }

                getList();
                setInterval(getList, 5000);
            }
        }
    });

    app.directive('imgError', function () {
        return {
            restrict: 'A',
            scope: {
                imgError: '='
            },
            link: function (scope, element, attrs) {
                element.bind('error', function () {
                    if (attrs.src != scope.imgError) {
                        attrs.$set('src', scope.imgError);
                    }
                });
            }
        }
    });

    app.filter('makeUrl', function () {
        return function (input) {
            if (typeof input !== 'string') {
                return input;
            }

            return input.match(/^https?:/) ? input : IPBAW.url.replace(/\/+$/g, '') + input;
        }
    });

})();
