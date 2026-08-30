export enum MongoJsonFormat {
  SIMPLIFIED = 'simplified',
  EXTENDED = 'extended',
}

export function simplifyMongoDocument(val: unknown): unknown {
  if (val === null || val === undefined) {
    return val;
  }
  if (typeof val !== 'object') {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map(simplifyMongoDocument);
  }

  const obj = val as Record<string, unknown>;

  if (typeof obj.$oid === 'string') {
    return obj.$oid;
  }

  if (obj.$date !== undefined) {
    const d = obj.$date;
    if (typeof d === 'string' || typeof d === 'number') {
      return d;
    }
    if (d && typeof d === 'object') {
      const numLong = (d as Record<string, unknown>).$numberLong;
      if (typeof numLong === 'string' || typeof numLong === 'number') {
        const ms = Number(numLong);
        const date = new Date(ms);
        return isNaN(date.getTime()) ? numLong : date.toISOString();
      }
    }
    return d;
  }

  if (typeof obj.$numberLong === 'string') {
    const n = Number(obj.$numberLong);
    return Number.isSafeInteger(n) ? n : obj.$numberLong;
  }
  if (typeof obj.$numberInt === 'string') {
    return Number(obj.$numberInt);
  }
  if (typeof obj.$numberDouble === 'string') {
    return Number(obj.$numberDouble);
  }
  if (typeof obj.$numberDecimal === 'string') {
    return obj.$numberDecimal;
  }

  if (obj.$binary && typeof obj.$binary === 'object') {
    return (obj.$binary as Record<string, unknown>).base64 ?? obj.$binary;
  }

  if (obj.$regularExpression && typeof obj.$regularExpression === 'object') {
    const regexObj = obj.$regularExpression as Record<string, string>;
    return `/${regexObj.pattern || ''}/${regexObj.options || ''}`;
  }

  if (obj.$timestamp && typeof obj.$timestamp === 'object') {
    const tsObj = obj.$timestamp as Record<string, unknown>;
    return tsObj.t ?? tsObj;
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = simplifyMongoDocument(v);
  }
  return result;
}
