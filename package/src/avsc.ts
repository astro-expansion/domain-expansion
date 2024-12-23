import avsc from 'avsc';
import assert from 'node:assert';
import types from 'node:util/types';
import { runtime } from './utils.js';

Error.stackTraceLimit = Number.POSITIVE_INFINITY;

export function literalType(val: string): avsc.Schema {
  return {
    type: 'enum',
    name: val.replaceAll('-', '') + 'Enum',
    symbols: [val.replaceAll('-', '_')],
    logicalType: 'dashedEnum',
  };
}

export const commonTypes = {
  'stringArray': {
    type: 'array',
    name: 'StringArray',
    items: 'string'
  },
  'stringSet': {
    type: 'array',
    name: 'StringSet',
    items: 'string',
    logicalType: 'set',
  },
  'primitive': new avsc.types.UnwrappedUnionType([
    'null',
    'float',
    'string',
    'boolean',
  ], {}),
  'innerJson': {
    type: 'string',
    name: 'InnerJSON',
    logicalType: 'innerJson'
  },
  'htmlString': {
    type: 'string',
    name: 'HTMlString',
    logicalType: 'HTMLString',
  },
} satisfies Record<string, avsc.Schema>;

class SetType extends avsc.types.LogicalType {
  protected override _fromValue(val: any): any {
    assert.ok(Array.isArray(val));
    return new Set(val);
  }
  protected override _toValue(val: any): any {
    assert.ok(types.isSet(val));
    return Array.from(val);
  };
}

class JSONType extends avsc.types.LogicalType {
  protected override _fromValue(val: any): any {
    assert.ok(typeof val === 'string');
    return val === '@@undefined@@' ? undefined : JSON.parse(val);
  }
  protected override _toValue(val: any): any {
    return val === undefined ? '@@undefined@@' : JSON.stringify(val)
  };
}

class HTMLStringType extends avsc.types.LogicalType {
  protected override _fromValue(val: any): any {
    assert.ok(typeof val === 'string');
    return new runtime.HTMLString(val);
  }
  protected override _toValue(val: any): any {
    return val.toString();
  };
}

class DashedEnumType extends avsc.types.LogicalType {
  protected override _fromValue(val: any): any {
    assert.ok(typeof val === 'string');
    return val.replaceAll('_', '-');
  }
  protected override _toValue(val: any): any {
    assert.ok(typeof val === 'string');
    return val.replaceAll('-', '_');
  };
}


export const logicalTypes: Record<string, typeof avsc.types.LogicalType> = {
  'set': SetType,
  'innerJson': JSONType,
  'HTMLString': HTMLStringType,
  'dashedEnum': DashedEnumType,
};

