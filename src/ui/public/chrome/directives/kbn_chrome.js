import $ from 'jquery';
import { remove } from 'lodash';

import './kbn_chrome.less';
import UiModules from 'ui/modules';
import { isSystemApiRequest } from 'ui/system_api';
import {
  getUnhashableStatesProvider,
  unhashUrl,
} from 'ui/state_management/state_hashing';

// kibi: imports
import { onDashboardPage } from 'ui/kibi/utils/on_page';

export default function (chrome, internals) {

  UiModules
  .get('kibana')
  .directive('kbnChrome', $rootScope => {
    return {
      template($el) {
        const $content = $(require('./kbn_chrome.html'));
        const $app = $content.find('.application');

        if (internals.rootController) {
          $app.attr('ng-controller', internals.rootController);
        }

        if (internals.rootTemplate) {
          $app.removeAttr('ng-view');
          $app.html(internals.rootTemplate);
        }

        return $content;
      },

      controllerAs: 'chrome',
      controller($scope, $rootScope, $location, $http, Private) {
        const getUnhashableStates = Private(getUnhashableStatesProvider);

        // kibi: show only the bar when on the dashboard page
        $scope.onDashboardPage = onDashboardPage();
        $scope.$watch(onDashboardPage, onPage => {
          if (onPage !== undefined) {
            $scope.onDashboardPage = onPage;
          }
        });
        // kibi: end

        // are we showing the embedded version of the chrome?
        internals.setVisibleDefault(!$location.search().embed);
        // kibi: added to be able to share dashboards with visible kibi-nav-bar
        internals.setKibiNavbarVisibleDefault($location.search().kibiNavbarVisible);
        // kibi: end

        // listen for route changes, propagate to tabs
        const onRouteChange = function () {
          // kibi: set URLs with hashes otherwise they might overflow
          const urlWithHashes = window.location.href;
          const urlWithStates = unhashUrl(urlWithHashes, getUnhashableStates());
          internals.trackPossibleSubUrl(urlWithHashes);
          // kibi: end
        };

        $rootScope.$on('$routeChangeSuccess', onRouteChange);
        $rootScope.$on('$routeUpdate', onRouteChange);
        onRouteChange();

        const allPendingHttpRequests = () => $http.pendingRequests;
        const removeSystemApiRequests = (pendingHttpRequests = []) => remove(pendingHttpRequests, isSystemApiRequest);
        $scope.$watchCollection(allPendingHttpRequests, removeSystemApiRequests);

        // and some local values
        chrome.httpActive = $http.pendingRequests;
        $scope.notifList = require('ui/notify')._notifs;

        return chrome;
      }
    };
  });

}
