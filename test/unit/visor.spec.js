'use strict';

describe('visor', function () {

    describe("authentication", function () {
        var defer, authCallCounter;

        beforeEach(function () {
            defer = null;
            authCallCounter = 0;
            angular.module("test.visor.authentication", ['visor'])
                .config(function (visorProvider) {
                    visorProvider.authenticate = function ($q) {
                        defer = defer || $q.defer();
                        authCallCounter++;
                        return defer.promise;
                    };
                });
            module("test.visor.authentication");
        });

        it("should send authInfo to permission checks", inject(function ($rootScope, visorPermissions) {
            var argumentsInNext = null;
            visorPermissions.onRouteChange({
                restrict: function () {
                    argumentsInNext = arguments;
                }
            }, function () {
            });
            defer.resolve("authValue");
            $rootScope.$apply();
            expect(Array.prototype.slice.call(argumentsInNext, 0)).toEqual(["authValue"]);
        }));

        it("should call authenticate on startup by default", inject(function ($rootScope, visor) {
            $rootScope.$apply();
            expect(authCallCounter).toEqual(1);
        }));

        it("should not call authenticate twice if route starts before authentication done", inject(function ($rootScope, visorPermissions, visor) {
            $rootScope.$apply();
            expect(authCallCounter).toEqual(1);
            visorPermissions.onRouteChange({
                restrict: function () {
                    return true;
                }
            }, function () {
            });
            $rootScope.$apply();
            expect(authCallCounter).toEqual(1);
        }));

        it("should not change route until autentication on startup finishes", inject(function ($rootScope, $location, visor) {
            $location.url("/thingy");
            $rootScope.$apply();
            expect($location.url()).toEqual("");
            defer.resolve(null);
            $rootScope.$apply();
            expect($location.url()).toEqual("/thingy");
        }));

        it("should not call authenticate on startup if flag disabled, and call it only on first permission check", function () {
            angular.module("test.visor.authentication.nostartup", ["test.visor.authentication"]).config(function (visorProvider) {
                visorProvider.authenticateOnStartup = false;
                module("test.visor.authentication.nostartup");
                inject(function ($rootScope, $location, visorPermissions) {
                    $location.url("/thingy");
                    $rootScope.$apply();
                    expect($location.url()).toEqual("/thingy");
                    expect(authCallCounter).toEqual(0);
                    visorPermissions.onRouteChange({}, function () {
                    });
                    $rootScope.$apply();
                    expect(authCallCounter).toEqual(0);
                    visorPermissions.onRouteChange({
                        restrict: function () {
                        }
                    }, function () {
                    });
                    $rootScope.$apply();
                    expect(authCallCounter).toEqual(1);
                });
            })
        });
        it("should allow using dependent services in auth", function () {
            var authCalled = false;
            angular.module("test.visor.authentication.with.service", ['visor'])
                .service("authService", function ($q) {
                    return function () {
                        authCalled = true;
                        return $q.when("auth!");
                    }
                })
                .config(function (visorProvider) {
                    visorProvider.authenticate = function (authService) {
                        return authService()
                    };
                });
            module("test.visor.authentication.with.service");
            inject(function (visor, $location, $rootScope) {
                $location.url("/thingy");
                $rootScope.$apply();
                expect(authCalled).toEqual(true);
            });
        })
    });

    describe("ngRoute", function () {

        var authenticate = null;

        beforeEach(function () {
            authenticate = null;
            angular.module("test.config.ngRoute", ['ngRoute', 'visor'])
                .config(function ($routeProvider, visorProvider, authenticatedOnly, notForAuthenticated) {

                    $routeProvider.when("/private_url", {
                        restrict: authenticatedOnly
                    })
                        .when("/public", {})
                        .when("/hidden", {
                            restrict: notForAuthenticated
                        })
                        .when("/login", {})
                        .when("/access_denied", {});
                    visorProvider.authenticate = function ($q) {
                        return authenticate($q);
                    };
                });
        });

        it('should allow already loggedin user into authenticatedOnly route', function () {
            authenticate = function ($q) {
                return $q.when({username: "myName"});
            };
            module("test.config.ngRoute");
            inject(function ($rootScope, $location, $route, visor, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($location.url()).toEqual("/private_url")
            });
        });

        it('should redirect anonymous users to login if accessing private route', function () {
            authenticate = function ($q) {
                return $q.reject("not authenticated");
            };
            module("test.config.ngRoute");
            inject(function ($rootScope, $q, $location, $route, visor, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($route.current.originalPath).toEqual("/login");
                expect($location.search().next).toEqual("/private_url");
            });
        });

        it('should not redirect anonymous users to login if accessing public route', function () {
            authenticate = function ($q) {
                return $q.reject("not authenticated");
            };
            module("test.config.ngRoute");
            inject(function ($rootScope, $location, $route, $q, visor, $timeout) {
                $location.url("/public");
                $rootScope.$apply();
                $timeout.flush();
                expect($location.url()).toEqual("/public");
            });
        });
        it('should allow access to private states after authentication', function () {
            authenticate = function ($q) {
                return $q.reject("not authenticated");
            };
            module("test.config.ngRoute");
            inject(function ($rootScope, $route, $q, visor, $location, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($route.current.originalPath).toEqual("/login");
                visor.setAuthenticated({username: "some_name"});
                $rootScope.$apply();
                //should redirect back to original route automatically
                expect($location.url()).toEqual("/private_url");
            });
        });

        it('should not allow access if user is not authorized', function () {
            authenticate = function ($q) {
                return $q.when(true);
            };
            module("test.config.ngRoute");
            inject(function ($rootScope, $route, $q, visor, $location, $timeout) {
                $location.url("/hidden");
                $rootScope.$apply();
                $timeout.flush();
                expect($route.current.originalPath).toEqual("/access_denied");
                expect($location.url()).toEqual("/access_denied");
            });
        });
    });

    describe('ui-router', function () {

        var authenticate = null;

        beforeEach(function () {
            authenticate = null;
            angular.module("test.config", ['ui.router', 'visor'])
                .config(function ($stateProvider, visorProvider, authenticatedOnly, notForAuthenticated) {

                    $stateProvider.state("private", {
                        url: "/private_url",
                        restrict: authenticatedOnly
                    })
                        .state("public", {
                            url: "/public"
                        })
                        .state("hidden", {
                            url: "/hidden",
                            restrict: notForAuthenticated
                        })
                        .state("private.nestedpublic", {
                            url: "/public"
                        })
                        .state("public.nestedprivate", {
                            url: "/public/private",
                            restrict: authenticatedOnly
                        })
                        .state("login", {
                            url: "/login"
                        })
                        .state("access_denied", {
                            url: "/access_denied"
                        });
                    visorProvider.authenticate = function ($q) {
                        return authenticate($q);
                    };
                });
        });

        it('should allow already loggedin user into authenticatedOnly route', function () {
            authenticate = function ($q) {
                return $q.when({username: "myName"});
            };
            module("test.config");
            inject(function ($rootScope, $location, $state, $q, visor, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($location.url()).toEqual("/private_url")
            });
        });

        it('should redirect anonymous users to login if accessing private route', function () {
            authenticate = function ($q) {
                return $q.reject("not authenticated");
            };
            module("test.config");
            inject(function ($rootScope, $state, $q, $location, visor, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($state.current.name).toEqual("login");
                expect($location.search().next).toEqual("/private_url");
            });
        });
        it('should redirect anonymous users to login if accessing private route after visitng public url', function () {
            authenticate = function ($q) {
                return $q.reject("not authenticated");
            };
            module("test.config");
            inject(function ($rootScope, $state, $q, $location, visor, $timeout) {
                $location.url("/public");
                $rootScope.$apply();
                $timeout.flush();
                $state.go('private');
                $rootScope.$apply();
                $timeout.flush();
                expect($state.current.name).toEqual("login");
                expect($location.search().next).toEqual("/private_url");
            });
        });
        it('should not redirect anonymous users to login if accessing public route', function () {
            authenticate = function ($q) {
                return $q.reject("not authenticated");
            };
            module("test.config");
            inject(function ($rootScope, $location, $state, $q, visor, $timeout) {
                $location.url("/public");
                $rootScope.$apply();
                $timeout.flush();
                expect($location.url()).toEqual("/public");
            });
        });
        it('should allow access to private states after authentication', function () {
            authenticate = function ($q) {
                return $q.reject("not authenticated");
            };
            module("test.config");
            inject(function ($rootScope, $state, $q, visor, $location, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($state.current.name).toEqual("login");
                visor.setAuthenticated({username: "some_name"});
                $rootScope.$apply();
                //should redirect back to original route automatically
                expect($location.url()).toEqual("/private_url");
            });
        });

        it('should not allow access if user is not authorized', function () {
            authenticate = function ($q) {
                return $q.when(true);
            };
            module("test.config");
            inject(function ($rootScope, $state, $q, visor, $location, $timeout) {
                $location.url("/hidden");
                $rootScope.$apply();
                $timeout.flush();
                expect($state.current.name).toEqual("access_denied");
                expect($location.url()).toEqual("/access_denied");
            });
        });
    });

    describe('next url',function(){
        it('should add nextUrl to loginRoute with existing parameters', function () {
            angular.module("test.nextUrl.1", ['ui.router', 'visor'])
                .config(function ($stateProvider, visorProvider, authenticatedOnly) {
                    $stateProvider.state("private", {
                        url: "/private_url",
                        restrict: authenticatedOnly
                    })
                        .state("diffLogin", {
                            url: "/diffLogin?name"
                        })
                    visorProvider.loginRoute = "/diffLogin?name=myName#myHash"
                    visorProvider.authenticate = function ($q) {
                        return $q.reject("not authenticated");
                    };
                });
            module("test.nextUrl.1");
            inject(function ($rootScope, $state, $q, $location, visor, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($state.current.name).toEqual("diffLogin");
                expect($location.search().next).toEqual("/private_url");
                expect($location.search().name).toEqual("myName");
                expect($location.hash()).toEqual("myHash");
                visor.setAuthenticated({username: "some_name"});
                $rootScope.$apply();
                //should redirect back to original route automatically
                expect($location.url()).toEqual("/private_url");
            });
        });
        it('should add nextUrl to loginRoute if shouldAddNext option is disabled', function () {
            angular.module("test.nextUrl.2", ['ui.router', 'visor'])
                .config(function ($stateProvider, visorProvider, authenticatedOnly) {
                    $stateProvider.state("private", {
                        url: "/private_url",
                        restrict: authenticatedOnly
                    })
                        .state("login", {
                            url: "/login"
                        })
                    visorProvider.shouldAddNext = false;
                    visorProvider.authenticate = function ($q) {
                        return $q.reject("not authenticated");
                    };
                });
            module("test.nextUrl.2");
            inject(function ($rootScope, $state, $q, $location, visor, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($state.current.name).toEqual("login");
                expect($location.search().next).toBe(undefined);
            });
        });
        it('should override next parameter in loginUrl', function () {
            angular.module("test.nextUrl.3", ['ui.router', 'visor'])
                .config(function ($stateProvider, visorProvider, authenticatedOnly) {
                    $stateProvider.state("private", {
                        url: "/private_url",
                        restrict: authenticatedOnly
                    })
                        .state("login", {
                            url: "/login?next"
                        })
                    visorProvider.loginRoute = "/login?next=bad"
                    visorProvider.authenticate = function ($q) {
                        return $q.reject("not authenticated");
                    };
                });
            module("test.nextUrl.3");
            inject(function ($rootScope, $state, $q, $location, visor, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($state.current.name).toEqual("login");
                expect($location.search().next).toEqual("/private_url");
            });
        });
        it('should not override next parameter in loginUrl if shouldAddNext is disabled', function () {
            angular.module("test.nextUrl.4", ['ui.router', 'visor'])
                .config(function ($stateProvider, visorProvider, authenticatedOnly) {
                    $stateProvider.state("private", {
                        url: "/private_url",
                        restrict: authenticatedOnly
                    })
                        .state("login", {
                            url: "/login?next"
                        })
                    visorProvider.loginRoute = "/login?next=bad"
                    visorProvider.shouldAddNext = false;
                    visorProvider.authenticate = function ($q) {
                        return $q.reject("not authenticated");
                    };
                });
            module("test.nextUrl.4");
            inject(function ($rootScope, $state, $q, $location, visor, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($state.current.name).toEqual("login");
                expect($location.search().next).toEqual("bad");
            });
        });
        it('should allow next parameter to be replaced with different name', function () {
            angular.module("test.nextUrl.5", ['ui.router', 'visor'])
                .config(function ($stateProvider, visorProvider, authenticatedOnly) {
                    $stateProvider.state("private", {
                        url: "/private_url",
                        restrict: authenticatedOnly
                    })
                    .state("login", {
                        url: "/login?next"
                    })
                    visorProvider.loginRoute = "/login?next=shouldStay"
                    visorProvider.nextParameterName = "newNext"
                    visorProvider.authenticate = function ($q) {
                        return $q.reject("not authenticated");
                    };
                });
            module("test.nextUrl.5");
            inject(function ($rootScope, $state, $q, $location, visor, $timeout) {
                $location.url("/private_url");
                $rootScope.$apply();
                $timeout.flush();
                expect($state.current.name).toEqual("login");
                expect($location.search().next).toEqual("shouldStay");
                expect($location.search().newNext).toEqual("/private_url");
                visor.setAuthenticated({username: "some_name"});
                $rootScope.$apply();
                //should redirect back to original route automatically
                expect($location.url()).toEqual("/private_url");
            });
        });
    })
});