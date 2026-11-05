import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  APPENDIX_MARKER,
  parseAnswerBlocks,
  parseInline,
  splitDiagnosisAnswer,
} from './diagnosis-answer-view.ts';

describe('splitDiagnosisAnswer', () => {
  it('treats the whole answer as Visual Summary when the marker is missing', () => {
    const split = splitDiagnosisAnswer('## 發現\nCPU 偏高');
    assert.equal(split.summary, '## 發現\nCPU 偏高');
    assert.equal(split.appendix, null);
  });

  it('splits on ## 詳細資料', () => {
    const split = splitDiagnosisAnswer(`## 發現\n穩健\n\n## ${APPENDIX_MARKER}\n節點 a 92%`);
    assert.equal(split.summary, '## 發現\n穩健');
    assert.equal(split.appendix, '節點 a 92%');
  });

  it('splits on a bold 詳細資料 line', () => {
    const split = splitDiagnosisAnswer(`摘要\n**${APPENDIX_MARKER}**\n細節`);
    assert.equal(split.summary, '摘要');
    assert.equal(split.appendix, '細節');
  });
});

describe('parseAnswerBlocks', () => {
  it('maps **title** lines to headings instead of leaving asterisks', () => {
    const blocks = parseAnswerBlocks('**發現**\n內容');
    assert.deepEqual(blocks[0], { type: 'heading', text: '發現' });
    assert.equal(blocks[1]?.type, 'paragraph');
  });

  it('parses Report Callout kinds', () => {
    const blocks = parseAnswerBlocks('重點：飽和偏高\n提示：先看 kube-system\n風險：重啟偏多\n建議：cordon node-a');
    assert.deepEqual(
      blocks.map((b) => (b.type === 'callout' ? [b.kind, b.text] : b.type)),
      [
        ['重點', '飽和偏高'],
        ['提示', '先看 kube-system'],
        ['風險', '重啟偏多'],
        ['建議', 'cordon node-a'],
      ],
    );
  });

  it('parses a markdown table', () => {
    const blocks = parseAnswerBlocks('| 節點 | CPU |\n| --- | --- |\n| n1 | 92% |');
    assert.equal(blocks[0]?.type, 'table');
    if (blocks[0]?.type !== 'table') return;
    assert.deepEqual(blocks[0].headers, ['節點', 'CPU']);
    assert.deepEqual(blocks[0].rows, [['n1', '92%']]);
  });

  it('does not turn markdown images into a chart/image block', () => {
    const blocks = parseAnswerBlocks('摘要\n![cpu](https://cdn.example.com/trend.png)');
    assert.equal(blocks.some((b) => (b as { type: string }).type === 'image'), false);
    assert.ok(blocks.some((b) => b.type === 'paragraph' && b.text.includes('![')));
  });
});

describe('parseInline', () => {
  it('keeps emphasis without showing asterisks', () => {
    assert.deepEqual(parseInline('請先查 **kube-system** 命名空間'), [
      { text: '請先查 ', bold: false },
      { text: 'kube-system', bold: true },
      { text: ' 命名空間', bold: false },
    ]);
  });
});
