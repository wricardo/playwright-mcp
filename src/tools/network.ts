/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { z } from 'zod';
import { defineTabTool } from './tool.js';

import type * as playwright from 'playwright';

const requests = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_network_requests',
    title: 'List network requests',
    description: 'Returns all network requests since loading the page',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const requests = tab.requests();
    const requestEntries = [...requests.entries()];
    
    if (requestEntries.length === 0) {
      response.addResult('No network requests captured.');
      return;
    }

    if (response.context.config.outputToFiles) {
      // Write ALL network requests to file, show ONLY file reference
      const renderedRequests = await Promise.all(
        requestEntries.map(([req, res]) => renderRequest(req, res))
      );
      const allRequests = renderedRequests.join('\n\n');
      await response.addResultWithFileOption(allRequests, 'network');
      // NO additional content in response - everything goes to file
    } else {
      // Include requests in response (existing behavior)
      for (const [req, res] of requestEntries) {
        response.addResult(await renderRequest(req, res));
      }
    }
  },
});

async function renderRequest(request: playwright.Request, response: playwright.Response | null): Promise<string> {
  const result: string[] = [];
  result.push(`[${request.method().toUpperCase()}] ${request.url()}`);
  
  // Add request headers for GraphQL or JSON requests
  const contentType = request.headers()['content-type'];
  if (contentType?.includes('application/json') || request.url().includes('graphql')) {
    try {
      const postData = request.postData();
      if (postData) {
        result.push(`Request Body: ${postData}`);
      }
    } catch (e) {
      // Some requests may not have accessible post data
    }
  }
  
  if (response) {
    result.push(`=> [${response.status()}] ${response.statusText()}`);
    
    // Add response body for GraphQL or JSON responses
    const responseContentType = response.headers()['content-type'];
    if (responseContentType?.includes('application/json') || request.url().includes('graphql')) {
      try {
        const body = await response.body();
        const jsonBody = JSON.parse(body.toString());
        result.push(`Response Body: ${JSON.stringify(jsonBody, null, 2)}`);
      } catch (e) {
        // Response body might not be JSON or might be too large
        try {
          const body = await response.body();
          result.push(`Response Body (raw): ${body.toString().substring(0, 1000)}`);
        } catch (e2) {
          result.push(`Response Body: [Unable to read]`);
        }
      }
    }
  }
  
  return result.join('\n');
}

export default [
  requests,
];
