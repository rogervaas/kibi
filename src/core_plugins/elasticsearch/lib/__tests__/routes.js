import { format } from 'util';

import * as kbnTestServer from '../../../../test_utils/kbn_server';
import { fromRoot } from '../../../../utils';

describe('plugins/elasticsearch', function () {
  describe('routes', function () {
    let kbnServer;

    before(async function () {
      // Sometimes waiting for server takes longer than 10s.
      // NOTE: This can't be a fat-arrow function because `this` needs to refer to the execution
      // context, not to the parent context.
      this.timeout(60000);

      kbnServer = kbnTestServer.createServer({
        plugins: {
          // kibi: explicitly add the required plugins
          paths: [
            fromRoot('src/core_plugins/kibana'),
            fromRoot('src/core_plugins/elasticsearch'),
            fromRoot('src/kibi_plugins/kibi_core'),
            fromRoot('src/kibi_plugins/saved_objects_api')
          ]
        },
      });

      await kbnServer.ready();
      await kbnServer.server.plugins.elasticsearch.waitUntilReady();
    });

    after(function () {
      return kbnServer.close();
    });

    function testRoute(options, statusCode = 200) {
      if (typeof options.payload === 'object') {
        options.payload = JSON.stringify(options.payload);
      }

      describe(format('%s %s', options.method, options.url), function () {
        it('should return ' + statusCode, function (done) {
          kbnTestServer.makeRequest(kbnServer, options, function (res) {
            if (res.statusCode === statusCode) {
              done();
              return;
            }

            done(new Error(`
              Invalid response code from elasticseach:
                ${res.statusCode} should be ${statusCode}

              Response:
                ${res.payload}
            `));
          });
        });
      });
    }

    testRoute({
      method: 'GET',
      url: '/elasticsearch/_nodes'
    });

    testRoute({
      method: 'GET',
      url: '/elasticsearch/'
    });

    testRoute({
      method: 'POST',
      url: '/elasticsearch/.kibi'
    }, 405);

    testRoute({
      method: 'PUT',
      url: '/elasticsearch/.kibi'
    }, 405);

    testRoute({
      method: 'DELETE',
      url: '/elasticsearch/.kibi'
    }, 405);

    testRoute({
      method: 'GET',
      url: '/elasticsearch/.kibi'
    });

    testRoute({
      method: 'POST',
      url: '/elasticsearch/.kibi/_bulk',
      payload: '{}'
    }, 400);

    testRoute({
      method: 'POST',
      url: '/elasticsearch/.kibi/__kibanaQueryValidator/_validate/query?explain=true&ignore_unavailable=true',
      headers: {
        'content-type': 'application/json'
      },
      payload: { query: { query_string: { analyze_wildcard: true, query: '*' } } }
    });

    testRoute({
      method: 'POST',
      url: '/elasticsearch/_mget',
      headers: {
        'content-type': 'application/json'
      },
      payload: { docs: [{ _index: '.kibi', _type: 'index-pattern', _id: '[logstash-]YYYY.MM.DD' }] }
    });

    testRoute({
      method: 'POST',
      url: '/elasticsearch/_msearch',
      headers: {
        'content-type': 'application/json'
      },
      payload: '{"index":"logstash-2015.04.21","ignore_unavailable":true}\n{"size":500,"sort":{"@timestamp":"desc"},"query":{"bool":{"must":[{"query_string":{"analyze_wildcard":true,"query":"*"}},{"bool":{"must":[{"range":{"@timestamp":{"gte":1429577068175,"lte":1429577968175}}}],"must_not":[]}}],"must_not":[]}},"highlight":{"pre_tags":["@kibana-highlighted-field@"],"post_tags":["@/kibana-highlighted-field@"],"fields":{"*":{}}},"aggs":{"2":{"date_histogram":{"field":"@timestamp","interval":"30s","min_doc_count":0,"extended_bounds":{"min":1429577068175,"max":1429577968175}}}},"stored_fields":["*"],"_source": true,"script_fields":{},"docvalue_fields":["timestamp_offset","@timestamp","utc_time"]}\n' // eslint-disable-line max-len
    });

  });
});
