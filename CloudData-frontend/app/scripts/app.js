'use strict';

angular.module('clouddataFrontendApp', ['ui.router', 'ui.bootstrap', 'restangular', 'angularBootstrapNavTree', 'ngGrid', 'ui.select', 'formly', 'formlyBootstrap'
])
// principal is a service that tracks the user's identity. 
// calling identity() returns a promise while it does what you need it to do
// to look up the signed-in user's identity info. for example, it could make an 
// HTTP request to a rest endpoint which returns the user's name, roles, etc.
// after validating an auth token in a cookie. it will only do this identity lookup
// once, when the application first runs. you can force re-request it by calling identity(true)
.factory('principal', ['$q', '$http', '$timeout',
  function($q, $http, $timeout) {
    var _identity = undefined,
      _authenticated = false;

    return {
      isIdentityResolved: function() {
        if (_identity) return true;
        return false;
      },
      isAuthenticated: function() {
        return _authenticated;
      },
      isInRole: function(role) {
        if (!_authenticated || !_identity.roles) return false;

        return _identity.roles.indexOf(role) != -1;
      },
      isAdmin: function() {
        var myidentity = angular.fromJson(store.get("clouddataFrontendApp.identity"));
        return myidentity && myidentity.roles.indexOf('admin') != -1;
      },
      isInAnyRole: function(roles) {
        if (roles.indexOf('*') > 0) return true;
        if (!_authenticated || !_identity.roles) return false;

        for (var i = 0; i < roles.length; i++) {
          if (this.isInRole(roles[i])) return true;
        }

        return false;
      },
      authenticate: function(identity) {
        _identity = identity;
        _authenticated = identity != null;

        // for this demo, we'll store the identity in localStorage. For you, it could be a cookie, sessionStorage, whatever
        if (identity) store.set("clouddataFrontendApp.identity", angular.toJson(identity));
        else store.remove("clouddataFrontendApp.identity");
      },
      identity: function(force) {
        var deferred = $q.defer();

        if (force === true) _identity = undefined;

        // check and see if we have retrieved the identity data from the server. if we have, reuse it by immediately resolving
        if (_identity) {
          deferred.resolve(_identity);

          return deferred.promise;
        }

        // otherwise, retrieve the identity data from the server, update the identity object, and then resolve.
        //                   $http.get('/svc/account/identity', { ignoreErrors: true })
        //                        .success(function(data) {
        //                            _identity = data;
        //                            _authenticated = true;
        //                            deferred.resolve(_identity);
        //                        })
        //                        .error(function () {
        //                            _identity = null;
        //                            _authenticated = false;
        //                            deferred.resolve(_identity);
        //                        });

        // for the sake of the demo, we'll attempt to read the identity from localStorage. the example above might be a way if you use cookies or need to retrieve the latest identity from an api
        // i put it in a timeout to illustrate deferred resolution
        var self = this;
        $timeout(function() {
          _identity = angular.fromJson(store.get("clouddataFrontendApp.identity"));
          self.authenticate(_identity);
          deferred.resolve(_identity);
        }, 1000);

        return deferred.promise;
      }
    };
  }
])
// authorization service's purpose is to wrap up authorize functionality
// it basically just checks to see if the principal is authenticated and checks the root state 
// to see if there is a state that needs to be authorized. if so, it does a role check.
// this is used by the state resolver to make sure when you refresh, hard navigate, or drop onto a
// route, the app resolves your identity before it does an authorize check. after that,
// authorize is called from $stateChangeStart to make sure the principal is allowed to change to
// the desired state
.factory('authorization', ['$rootScope', '$state', 'principal',
  function($rootScope, $state, principal) {
    return {
      authorize: function() {
        return principal.identity()
          .then(function() {
            var isAuthenticated = principal.isAuthenticated();

            if ($rootScope.toState.data.roles.length > 0 && !principal.isInAnyRole($rootScope.toState.data.roles)) {
              if (isAuthenticated) $state.go('accessdenied'); // user is signed in but not authorized for desired state
              else {
                // user is not authenticated. stow the state they wanted before you
                // send them to the signin state, so you can return them when you're done
                $rootScope.returnToState = $rootScope.toState;
                $rootScope.returnToStateParams = $rootScope.toStateParams;

                // now, send them to the signin state so they can log in
                $state.go('signin');
              }
            }
          });
      }
    };
  }
])
  .config(function(formlyConfigProvider) {
    formlyConfigProvider.setWrapper({
      name: 'loader',
      template: [
        '<formly-transclude></formly-transclude>',
        '<span class="glyphicon glyphicon-refresh loader" ng-show="to.loading"></span>'
      ].join(' ')
    });

    formlyConfigProvider.setType({
      name: 'input-loader',
      extends: 'input',
      wrapper: ['loader']
    });

    formlyConfigProvider.setWrapper({
      template: '<formly-transclude></formly-transclude><div my-messages="options"></div>',
      types: ['input', 'checkbox', 'select', 'textarea', 'radio', 'input-loader']
    });
  })
// .config(function(formlyConfigProvider) {
//   var templates = '/views/fields/';
//   var formly = templates + 'formly-field-';
//   var fields = [
//     'checkbox',
//     'email',
//     'hidden',
//     'number',
//     'password',
//     'radio',
//     'select',
//     'text',
//     'textarea',
//     'multiselect',
//     'date',
//     'time',
//     'relation'
//   ];

//   angular.forEach(fields, function(val) {
//     formlyConfigProvider.setTemplateUrl(val, formly + val + '.html');
//   });

// })

.config(function(uiSelectConfig) {
  //uiSelectConfig.search-enabled=true;
  uiSelectConfig.theme = 'bootstrap';
  uiSelectConfig.resetSearchInput = true;
})
  .config(function(RestangularProvider) {
    RestangularProvider.setBaseUrl('http://localhost:8080/rest/');
    RestangularProvider.setRequestInterceptor(function(elem, operation) {
      if (operation === "remove") {
        return undefined;
      }
      return elem;
    });
  })
  .config(['$stateProvider', '$urlRouterProvider',
    function($stateProvider, $urlRouterProvider) {

      $urlRouterProvider.otherwise('/app');

      $stateProvider.state('site', {
        'abstract': true,
        resolve: {
          authorize: ['authorization',
            function(authorization) {
              return authorization.authorize();
            }
          ]
        }
      }).state('app', {
        url: '/app',
        data: {
          roles: ['User', 'admin']
        },
        templateUrl: 'views/main.html',
        controller: 'MainCtrl'
      }).state('signin', {
        url: '/signin',
        data: {
          roles: ['*']
        },
        templateUrl: 'views/login.html',
        controller: 'SigninCtrl'
      }).state('restricted', {
        parent: 'site',
        url: '/restricted',
        data: {
          roles: ['admin']
        },
        views: {
          'content@': {
            templateUrl: 'restricted.html'
          }
        }
      }).state('accessdenied', {
        parent: 'site',
        url: '/denied',
        data: {
          roles: ['*']
        },
        views: {
          'content@': {
            templateUrl: 'denied.html'
          }
        }
      }).state('app.user', {
        url: '/user',
        data: {
          roles: ['admin']
        },
        templateUrl: 'views/user.html',
        controller: 'UserCtrl'
      }).state('app.org', {
        url: '/org',
        data: {
          roles: ['admin']
        },
        templateUrl: 'views/org.html',
        controller: 'OrgCtrl'
      }).state('app.role', {
        url: '/role',
        data: {
          roles: ['admin']
        },
        templateUrl: 'views/role.html',
        controller: 'RoleCtrl'
      }).state('app.mt', {
        url: '/mt',
        data: {
          roles: ['admin']
        },
        templateUrl: 'views/mt.html',
        controller: 'MtCtrl'
      }).state('app.data', {
        url: '/data/:mid?vid',
        data: {
          roles: ['admin']
        },
        templateUrl: 'views/grid.html',
        controller: 'DataCtrl'
      }).state('app.formly', {
        url: '/formly/:mid/:rid',
        data: {
          roles: ['admin']
        },
        templateUrl: 'views/formly.html',
        controller: 'FormlyCtrl'
      }).state('app.query', {
        url: '/query/:mid/:vid',
        data: {
          roles: ['admin']
        },
        templateUrl: 'views/query.html',
        controller: 'QueryCtrl'
      }).state('app.detail', {
        url: '/detail/:mid/:rid',
        data: {
          roles: ['admin']
        },
        templateUrl: 'views/detail.html',
        controller: 'DetailCtrl'
      }).state('app.detail.relationObj', {
        url: '/detailRel/:rmid/:roid',
        data: {
          roles: ['admin']
        },
        views: {
          '': {
            templateUrl: 'views/detailRel.html',
            controller: 'DetailRelCtrl'
          }
        }
      });
    }
  ])
  .config(function($httpProvider) {

    // $httpProvider.interceptors.push(function($q, $rootScope, $location) {
    //   return {
    //     'responseError': function(rejection) {
    //       var status = rejection.status;
    //       var config = rejection.config;
    //       var method = config.method;
    //       var url = config.url;

    //       if (rejection.status === 401) {
    //         $location.path("/login");
    //       } else {
    //         $rootScope.error = method + " on " + url + " failed with status " + status;
    //       }

    //       return $q.reject(rejection);
    //     }
    //   };
    // });

    /* Registers auth token interceptor, auth token is either passed by header or by query parameter
     * as soon as there is an authenticated user */
    $httpProvider.interceptors.push(function($q, $rootScope, $location) {
      return {
        'request': function(config) {

          var isRestCall = config.url.indexOf('rest') > 0;
          var identity = store.get("clouddataFrontendApp.identity");
          var authToken = store.get("clouddataFrontendApp.token");
          if (!isRestCall && (!identity || !authToken)) {
            $location.path('signin');
          }
          if (isRestCall && authToken) {
            config.headers['X-Auth-Token'] = authToken;
          }
          return config || $q.when(config);
        }
      };
    });
  })
  .run(['$rootScope', '$state', '$stateParams', 'authorization', 'principal',
    function($rootScope, $state, $stateParams, authorization, principal) {
      $rootScope.$on('$stateChangeStart', function(event, toState, toStateParams) {
        $rootScope.toState = toState;
        $rootScope.toStateParams = toStateParams;

        if (principal.isIdentityResolved()) authorization.authorize();
      });
    }
  ]).run(function(formlyConfig) {
    var attributes = [
      'date-disabled',
      'custom-class',
      'show-weeks',
      'starting-day',
      'init-date',
      'min-mode',
      'max-mode',
      'format-day',
      'format-month',
      'format-year',
      'format-day-header',
      'format-day-title',
      'format-month-title',
      'year-range',
      'shortcut-propagation',
      'datepicker-popup',
      'show-button-bar',
      'current-text',
      'clear-text',
      'close-text',
      'close-on-date-selection',
      'datepicker-append-to-body'
    ];

    var bindings = [
      'datepicker-mode',
      'min-date',
      'max-date'
    ];

    var ngModelAttrs = {};

    angular.forEach(attributes, function(attr) {
      ngModelAttrs[camelize(attr)] = {
        attribute: attr
      };
    });

    angular.forEach(bindings, function(binding) {
      ngModelAttrs[camelize(binding)] = {
        bound: binding
      };
    });

    formlyConfig.setType({
      name: 'datepicker',
      template: '<input class="form-control" ng-model="model[options.key]" is-open="to.isOpen" datepicker-options="to.datepickerOptions" />',
      wrapper: ['bootstrapLabel', 'bootstrapHasError'],
      defaultOptions: {
        ngModelAttrs: ngModelAttrs,
        templateOptions: {
          addonLeft: {
            class: 'glyphicon glyphicon-calendar',
            onClick: function(options, scope) {
              options.templateOptions.isOpen = !options.templateOptions.isOpen;
            }
          },
          onFocus: function($viewValue, $modelValue, scope) {
            scope.to.isOpen = !scope.to.isOpen;
          },
          datepickerOptions: {}
        }
      }
    });

    function camelize(string) {
      string = string.replace(/[\-_\s]+(.)?/g, function(match, chr) {
        return chr ? chr.toUpperCase() : '';
      });
      // Ensure 1st char is always lowercase
      return string.replace(/^([A-Z])/, function(match, chr) {
        return chr ? chr.toLowerCase() : '';
      });
    }
  }).run(function(formlyConfig) {

    /*
  ngModelAttrs stuff
  */

    var ngModelAttrs = {};

    function camelize(string) {
      string = string.replace(/[\-_\s]+(.)?/g, function(match, chr) {
        return chr ? chr.toUpperCase() : '';
      });
      // Ensure 1st char is always lowercase
      return string.replace(/^([A-Z])/, function(match, chr) {
        return chr ? chr.toLowerCase() : '';
      });
    }

    /*
  timepicker
  */

    ngModelAttrs = {};

    // attributes
    angular.forEach([
      'meridians',
      'readonly-input',
      'mousewheel',
      'arrowkeys'
    ], function(attr) {
      ngModelAttrs[camelize(attr)] = {
        attribute: attr
      };
    });

    // bindings
    angular.forEach([
      'hour-step',
      'minute-step',
      'show-meridian'
    ], function(binding) {
      ngModelAttrs[camelize(binding)] = {
        bound: binding
      };
    });

    formlyConfig.setType({
      name: 'timepicker',
      template: '<timepicker ng-model="model[options.key]"></timepicker>',
      wrapper: ['bootstrapLabel', 'bootstrapHasError'],
      defaultOptions: {
        ngModelAttrs: ngModelAttrs,
        templateOptions: {
          datepickerOptions: {}
        }
      }
    });
  });