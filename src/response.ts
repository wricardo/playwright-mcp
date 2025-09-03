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

import { renderModalStates } from './tab.js';
import { outputFile } from './config.js';
import path from 'path';
import fs from 'fs/promises';

import type { Tab, TabSnapshot } from './tab.js';
import type { ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js';
import type { Context } from './context.js';
import type { FullConfig } from './config.js';

export class Response {
  private _result: string[] = [];
  private _code: string[] = [];
  private _images: { contentType: string, data: Buffer }[] = [];
  private _context: Context;
  private _includeSnapshot = false;
  private _includeTabs = false;
  private _tabSnapshot: TabSnapshot | undefined;
  private _outputFiles: string[] = [];

  readonly toolName: string;
  readonly toolArgs: Record<string, any>;
  private _isError: boolean | undefined;

  constructor(context: Context, toolName: string, toolArgs: Record<string, any>) {
    this._context = context;
    this.toolName = toolName;
    this.toolArgs = toolArgs;
  }

  addResult(result: string) {
    this._result.push(result);
  }

  async addResultWithFileOption(result: string, type: 'console' | 'network' = 'console') {
    if (this._context.config.outputToFiles && result.length > 500) {
      // Write detailed output to file if it's long and outputToFiles is enabled
      const filepath = await this._writeDetailedOutputToFile(result, type);
      this.addResult(`${type}: ${path.basename(filepath)}`);
      this.addResult(`Use: head/grep/tail/cat`);
    } else {
      this.addResult(result);
    }
  }

  get context(): Context {
    return this._context;
  }

  addError(error: string) {
    this._result.push(error);
    this._isError = true;
  }

  isError() {
    return this._isError;
  }

  result() {
    return this._result.join('\n');
  }

  addCode(code: string) {
    this._code.push(code);
  }

  code() {
    return this._code.join('\n');
  }

  addImage(image: { contentType: string, data: Buffer }) {
    this._images.push(image);
  }

  images() {
    return this._images;
  }

  setIncludeSnapshot() {
    this._includeSnapshot = true;
  }

  setIncludeTabs() {
    this._includeTabs = true;
  }

  private async _writeDetailedOutputToFile(detailedContent: string, type: 'snapshot' | 'console' | 'network'): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${this.toolName}-${timestamp}.txt`;
    const filepath = await outputFile(this._context.config, undefined, filename);
    
    await fs.writeFile(filepath, detailedContent, 'utf-8');
    this._outputFiles.push(filepath);
    
    return filepath;
  }

  private _shouldIncludeSnapshot(): boolean {
    // If outputToFiles is enabled, always capture snapshot but write to file
    if (this._context.config.outputToFiles) {
      return !!this._tabSnapshot;
    }
    
    // Original behavior
    return this._includeSnapshot || this._includeTabs;
  }

  async finish() {
    // All the async snapshotting post-action is happening here.
    // Everything below should race against modal states.
    if (this._includeSnapshot && this._context.currentTab())
      this._tabSnapshot = await this._context.currentTabOrDie().captureSnapshot();
    for (const tab of this._context.tabs())
      await tab.updateTitle();
  }

  tabSnapshot(): TabSnapshot | undefined {
    return this._tabSnapshot;
  }

  async serialize(): Promise<{ content: (TextContent | ImageContent)[], isError?: boolean }> {
    const response: string[] = [];

    // Start with command result.
    if (this._result.length) {
      response.push('### Result');
      response.push(this._result.join('\n'));
      response.push('');
    }

    // Add code if it exists.
    if (this._code.length) {
      response.push(`### Ran Playwright code
\`\`\`js
${this._code.join('\n')}
\`\`\``);
      response.push('');
    }

    // List browser tabs.
    if (this._includeSnapshot || this._includeTabs)
      response.push(...renderTabsMarkdown(this._context.tabs(), this._includeTabs));

    // Add snapshot if provided - write to file or include in response
    const shouldIncludeSnapshot = this._shouldIncludeSnapshot();
    if (shouldIncludeSnapshot && this._tabSnapshot?.modalStates.length) {
      const modalContent = renderModalStates(this._context, this._tabSnapshot.modalStates).join('\n');
      if (this._context.config.outputToFiles) {
        const filepath = await this._writeDetailedOutputToFile(modalContent, 'snapshot');
        response.push(`### Snapshot: ${path.basename(filepath)}`);
        response.push(`Use: head/grep/tail/cat`);
        response.push('');
      } else {
        response.push(modalContent);
        response.push('');
      }
    } else if (shouldIncludeSnapshot && this._tabSnapshot) {
      const snapshotContent = renderTabSnapshot(this._tabSnapshot, this._context.config);
      if (this._context.config.outputToFiles) {
        const filepath = await this._writeDetailedOutputToFile(snapshotContent, 'snapshot');
        response.push(`### Page info: ${path.basename(filepath)}`);
        response.push(`Use: head/grep/tail/cat`);
        response.push('');
      } else {
        response.push(snapshotContent);
        response.push('');
      }
    }

    // Main response part
    const content: (TextContent | ImageContent)[] = [
      { type: 'text', text: response.join('\n') },
    ];

    // Image attachments.
    if (this._context.config.imageResponses !== 'omit') {
      for (const image of this._images)
        content.push({ type: 'image', data: image.data.toString('base64'), mimeType: image.contentType });
    }

    return { content, isError: this._isError };
  }
}

function renderTabSnapshot(tabSnapshot: TabSnapshot, config: FullConfig): string {
  const lines: string[] = [];

  // Console messages - simplified for regular output, detailed content goes to files
  if (tabSnapshot.consoleMessages.length) {
    if (config.outputToFiles) {
      // Just show summary when writing to files
      lines.push(`### Console messages (${tabSnapshot.consoleMessages.length} total)`);
      lines.push(`- ${tabSnapshot.consoleMessages.length} console messages captured`);
    } else {
      // Original behavior - show limited console messages inline
      lines.push(`### New console messages`);
      const messages = tabSnapshot.consoleMessages.slice(0, 5);
      for (const message of messages) {
        lines.push(`- ${trim(message.toString(), 100)}`);
      }
      if (tabSnapshot.consoleMessages.length > 5) {
        lines.push(`- ... and ${tabSnapshot.consoleMessages.length - 5} more console messages`);
      }
    }
    lines.push('');
  }

  // Downloads - always show since they're usually important
  if (tabSnapshot.downloads.length) {
    lines.push(`### Downloads`);
    for (const entry of tabSnapshot.downloads) {
      if (entry.finished)
        lines.push(`- Downloaded file ${entry.download.suggestedFilename()} to ${entry.outputFile}`);
      else
        lines.push(`- Downloading file ${entry.download.suggestedFilename()} ...`);
    }
    lines.push('');
  }

  lines.push(`### Page state`);
  lines.push(`- Page URL: ${tabSnapshot.url}`);
  lines.push(`- Page Title: ${tabSnapshot.title}`);
  lines.push(`- Page Snapshot:`);
  lines.push('```yaml');
  lines.push(tabSnapshot.ariaSnapshot);
  lines.push('```');

  return lines.join('\n');
}

function renderTabsMarkdown(tabs: Tab[], force: boolean = false): string[] {
  if (tabs.length === 1 && !force)
    return [];

  if (!tabs.length) {
    return [
      '### Open tabs',
      'No open tabs. Use the "browser_navigate" tool to navigate to a page first.',
      '',
    ];
  }

  const lines: string[] = ['### Open tabs'];
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const current = tab.isCurrentTab() ? ' (current)' : '';
    lines.push(`- ${i}:${current} [${tab.lastTitle()}] (${tab.page.url()})`);
  }
  lines.push('');
  return lines;
}

function trim(text: string, maxLength: number) {
  if (text.length <= maxLength)
    return text;
  return text.slice(0, maxLength) + '...';
}
