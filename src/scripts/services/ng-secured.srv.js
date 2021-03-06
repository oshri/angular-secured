angular.module("ngSecured")
    .provider("ngSecured", ["$stateProvider",
                            "ngSecured.defaultStateNames",
                            "ngSecured.cacheOptions",
                            "$httpProvider",
                            function ($stateProvider,
                                      defaultStateNames,
                                      cacheOptions,
                                      $httpProvider) {

        var lastStateName,
            lastStateParams;

        var config = {
                loginState: defaultStateNames.NOT_AUTHENTICATED,
                unAuthorizedState: defaultStateNames.NOT_AUTHORIZED,
                postLoginState: defaultStateNames.NOT_AUTHENTICATED,
                postLogoutState: defaultStateNames.NOT_AUTHENTICATED,
	            fetchRoles: undefined,
                login: undefined,
                isAuthenticated: undefined,
                cache:{
                    timeout: cacheOptions.timeout.FOREVER,
                    location: cacheOptions.location.LOCAL_STORAGE
                },
                reloginOnHttpStatus: undefined
            };

        $stateProvider.state(defaultStateNames.BASE_STATE, {});
        $stateProvider.state(defaultStateNames.NOT_AUTHENTICATED, {views: {"@": {template: "please login to see this page."}}});
        $stateProvider.state(defaultStateNames.NOT_AUTHORIZED, {views: {"@": {template: "You are not authorized to see this page."}}});

        this.secure = function (userConfig) {
            angular.extend(config, userConfig);
        };


        function saveStateInCache(stateName, stateParams){
            lastStateName = stateName;
            lastStateParams = stateParams;
        }

        (function setupHttpInterceptor(){
            $httpProvider.interceptors.push(["$injector", "$q", function($injector, $q){
                return {
                    "responseError": function(error){
                        var reloginStatus = config.reloginOnHttpStatus;
                        if (reloginStatus){
                            var $state = $injector.get(["$state"]);

                            function goToLogin(status){
                                saveStateInCache($state.current.name, $state.params);
                                $state.go(config.loginState);
                            }

                            if (angular.isNumber(reloginStatus) &&
                                error.status === reloginStatus){
                                goToLogin();

                            } else if (angular.isArray(reloginStatus) &&
                                reloginStatus.indexOf(error.status) !== -1){
                                goToLogin();
                            }
                        }
                        return $q.reject(error);
                    }
                }
            }]);

        })();

        this.$get = ["$rootScope", "$state", "$q", "$injector",
                     "$angularCacheFactory",
            function ($rootScope, $state, $q, $injector,
                      $angularCacheFactory) {

                var roles,
                    cache;

                function initVars() {
                    lastStateName = config.postLoginState;
                    if (config.cache){
                        cache = $angularCacheFactory(cacheOptions.cacheKeys.MAIN_CACHE,
                                                    {storageMode: config.cache.location});
                    }

                }

                initVars();



                $rootScope.$on("$stateChangeStart", function (event, toState, toParams) {
                    if (!!toState.secured) {

                        if (!isAuthenticated()) {
                            event.preventDefault();
                            saveStateInCache(toState.name, toParams);
                            $state.go(config.loginState);
                        } else if (toState.secured.hasOwnProperty("role")) {

                            if (!roles || roles.indexOf(toState.secured.role)) {
                                event.preventDefault();
                                $state.go(config.unAuthorizedState);
                            }
                        }
                    }
                })

                function goToLastState() {
                    if (lastStateName) {
                        $state.go(lastStateName, lastStateParams);
                    }
                }

	            function fetchingRoles(){
                   if (!config.fetchRoles){
                       throw new Error("fetchRoles is not defined");
                   }
                    var rolesFetchResult = $injector.invoke(config.fetchRoles);

                    return $q.when(rolesFetchResult).then(
                        function (rolesValue) {
                            if (rolesValue) {
                                setRoles(rolesValue);
                            }
                            return rolesValue;
                        }
                    )

	            }

                function isAuthenticated(){
                    if (config.isAuthenticated){
                        return $injector.invoke(config.isAuthenticated);
                    }else if (config.cache && cache){
                        var isLoggedIn = cache.get(cacheOptions.cacheKeys.IS_LOGGED_IN);
                        return !!isLoggedIn;
                    }
                    return false;
                }

                function getRoles(){
                    if (!roles && config.cache){
                        roles = cache.get(cacheOptions.cacheKeys.ROLES);
                    }
                    return roles;
                }

	            function setRoles(rolesValue) {
		            if (angular.isString(rolesValue)) {
			            roles = [rolesValue];
		            } else if (!angular.isArray(rolesValue)) {
			            roles = undefined;
		            } else {
			            roles = rolesValue;
		            }
                    if (roles && config.cache){
                        cache.put(cacheOptions.cacheKeys.ROLES, roles)
                    }
	            }

                function includesRole(role) {
                    if (roles && roles.indexOf(role) !== -1) {
                        return true;
                    }
                    return false;
                }

                function loggingIn(credentials) {

                    if (!config.login) {
                        throw new Error("login function must be configured");
                    } else {
                        var loginPromise = $q.when($injector.invoke(config.login, config, {credentials: credentials}));
                        loginPromise.then(function(result){

                            if (config.cache){
                                cache.put(cacheOptions.cacheKeys.IS_LOGGED_IN, true);
                            }

                            if (config.fetchRoles){
                                fetchingRoles().then(function(){
                                    goToLastState();
                                });
                            }else{
                                goToLastState();
                            }
                        })
                        return loginPromise;
                    }
                }

                function getCacheConfig(){
                    return angular.copy(config.cache);
                }

                function loggingOut(relogin){
                    var result;
                    if (cache){
                        cache.removeAll();
                    }
                    if (config.logout){
                        result = $injector.invoke(config.logout);
                    }
                    if (relogin){
                        $state.go(config.loginState);
                    }else{
                        $state.go(config.postLogoutState);
                    }

                    return $q.when(result);
                }

                return {
                    _initVars: initVars,
                    _getCacheConfig: getCacheConfig,
                    loggingIn: loggingIn,
                    fetchingRoles: fetchingRoles,
                    isAuthenticated: isAuthenticated,
                    setRoles: setRoles,
                    getRoles: getRoles,
                    includesRole: includesRole,
                    loggingOut: loggingOut
                }
            }];
    }])