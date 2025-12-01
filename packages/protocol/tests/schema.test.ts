import {
  AssetVtxoSchema,
  AssetMetadataSchema,
  type AssetVtxo,
  type Vtxo,
  asTxId,
  asAddress,
  asGenome,
} from '../src/index';

describe('AssetMetadataSchema', () => {
  describe('Valid Cases', () => {
    it('should validate valid asset metadata', () => {
      const validMetadata = {
        dna: 'a'.repeat(64),
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
      };

      const result = AssetMetadataSchema.parse(validMetadata);

      expect(result.dna).toBe('a'.repeat(64));
      expect(result.generation).toBe(0);
      expect(result.cooldownBlock).toBe(100);
      expect(result.lastFedBlock).toBe(50);
      expect(result.xp).toBe(0);
      // parents is normalized to [] when undefined
      expect(result.parents).toEqual([]);
    });

    it('should default xp to 0 when not provided', () => {
      const validMetadata = {
        dna: 'a'.repeat(64),
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        // xp not provided
      };

      const result = AssetMetadataSchema.parse(validMetadata);

      expect(result.xp).toBe(0);
    });

    it('should validate asset metadata with xp', () => {
      const validMetadata = {
        dna: 'b'.repeat(64),
        generation: 1,
        cooldownBlock: 200,
        lastFedBlock: 150,
        xp: 100,
      };

      const result = AssetMetadataSchema.parse(validMetadata);

      expect(result.dna).toBe('b'.repeat(64));
      expect(result.generation).toBe(1);
      expect(result.xp).toBe(100);
    });

    it('should validate asset metadata with parents', () => {
      const validMetadata = {
        dna: 'b'.repeat(64),
        generation: 1,
        cooldownBlock: 200,
        lastFedBlock: 150,
        xp: 50,
        parents: ['1'.repeat(64), '2'.repeat(64)],
      };

      const result = AssetMetadataSchema.parse(validMetadata);

      expect(result.dna).toBe('b'.repeat(64));
      expect(result.generation).toBe(1);
      expect(result.xp).toBe(50);
      expect(result.parents).toEqual(['1'.repeat(64), '2'.repeat(64)]);
    });

    it('should validate higher generation numbers', () => {
      const validMetadata = {
        dna: 'c'.repeat(64),
        generation: 5,
        cooldownBlock: 500,
        lastFedBlock: 400,
        xp: 250,
      };

      const result = AssetMetadataSchema.parse(validMetadata);

      expect(result.generation).toBe(5);
      expect(result.xp).toBe(250);
    });
  });

  describe('Invalid Cases', () => {
    it('should reject missing dna field', () => {
      const invalidMetadata = {
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
      };

      expect(() => {
        AssetMetadataSchema.parse(invalidMetadata);
      }).toThrow();
    });

    it('should reject dna that is not 64 hex characters', () => {
      const invalidMetadata = {
        dna: 'a'.repeat(63), // Too short
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
      };

      expect(() => {
        AssetMetadataSchema.parse(invalidMetadata);
      }).toThrow();
    });

    it('should reject dna with invalid hex characters', () => {
      const invalidMetadata = {
        dna: 'g'.repeat(64), // Invalid hex
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
      };

      expect(() => {
        AssetMetadataSchema.parse(invalidMetadata);
      }).toThrow();
    });

    it('should reject negative generation', () => {
      const invalidMetadata = {
        dna: 'a'.repeat(64),
        generation: -1,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
      };

      expect(() => {
        AssetMetadataSchema.parse(invalidMetadata);
      }).toThrow();
    });

    it('should reject non-integer generation', () => {
      const invalidMetadata = {
        dna: 'a'.repeat(64),
        generation: 1.5,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
      };

      expect(() => {
        AssetMetadataSchema.parse(invalidMetadata);
      }).toThrow();
    });

    it('should reject negative cooldownBlock', () => {
      const invalidMetadata = {
        dna: 'a'.repeat(64),
        generation: 0,
        cooldownBlock: -1,
        lastFedBlock: 50,
        xp: 0,
      };

      expect(() => {
        AssetMetadataSchema.parse(invalidMetadata);
      }).toThrow();
    });

    it('should reject negative lastFedBlock', () => {
      const invalidMetadata = {
        dna: 'a'.repeat(64),
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: -1,
        xp: 0,
      };

      expect(() => {
        AssetMetadataSchema.parse(invalidMetadata);
      }).toThrow();
    });

    it('should reject parents with invalid TxID length', () => {
      const invalidMetadata = {
        dna: 'a'.repeat(64),
        generation: 1,
        cooldownBlock: 200,
        lastFedBlock: 150,
        xp: 0,
        parents: ['1'.repeat(63)], // Too short
      };

      expect(() => {
        AssetMetadataSchema.parse(invalidMetadata);
      }).toThrow();
    });

    it('should reject negative xp', () => {
      const invalidMetadata = {
        dna: 'a'.repeat(64),
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: -1, // Invalid
      };

      expect(() => {
        AssetMetadataSchema.parse(invalidMetadata);
      }).toThrow();
    });
  });
});

describe('AssetVtxoSchema', () => {
  const createValidVtxo = (): Omit<AssetVtxo, 'assetId' | 'metadata'> => ({
    txid: asTxId('1'.repeat(64)),
    vout: 0,
    amount: 1000,
    address: asAddress(
      'bcrt1p123456789012345678901234567890123456789012345678901234567890',
    ),
    spent: false,
  });

  const createValidMetadata = () => ({
    dna: asGenome('a'.repeat(64)),
    generation: 0,
    cooldownBlock: 100,
    lastFedBlock: 50,
    xp: 0,
  });

  describe('Valid Cases', () => {
    it('should validate a complete AssetVtxo', () => {
      const validAssetVtxo = {
        ...createValidVtxo(),
        assetId: 'koi_abc123',
        metadata: createValidMetadata(),
      };

      const result = AssetVtxoSchema.parse(validAssetVtxo);

      expect(result.txid).toBe('1'.repeat(64));
      expect(result.vout).toBe(0);
      expect(result.amount).toBe(1000);
      expect(result.assetId).toBe('koi_abc123');
      expect(result.metadata.dna).toBe('a'.repeat(64));
      expect(result.metadata.generation).toBe(0);
      expect(result.metadata.xp).toBe(0);
    });

    it('should validate AssetVtxo with xp', () => {
      const validAssetVtxo = {
        ...createValidVtxo(),
        assetId: 'koi_abc123',
        metadata: {
          ...createValidMetadata(),
          xp: 150,
        },
      };

      const result = AssetVtxoSchema.parse(validAssetVtxo);

      expect(result.metadata.xp).toBe(150);
    });

    it('should validate AssetVtxo with parents in metadata', () => {
      const validAssetVtxo = {
        ...createValidVtxo(),
        assetId: 'koi_xyz789',
        metadata: {
          ...createValidMetadata(),
          parents: ['2'.repeat(64), '3'.repeat(64)],
        },
      };

      const result = AssetVtxoSchema.parse(validAssetVtxo);

      expect(result.metadata.parents).toEqual(['2'.repeat(64), '3'.repeat(64)]);
    });

    it('should validate AssetVtxo with DNA hash as assetId', () => {
      const dna = 'f'.repeat(64);
      const validAssetVtxo = {
        ...createValidVtxo(),
        assetId: dna,
        metadata: {
          ...createValidMetadata(),
          dna: asGenome(dna),
        },
      };

      const result = AssetVtxoSchema.parse(validAssetVtxo);

      expect(result.assetId).toBe(dna);
      expect(result.metadata.dna).toBe(dna);
    });
  });

  describe('Invalid Cases', () => {
    it('should reject AssetVtxo with missing assetId', () => {
      const invalidAssetVtxo = {
        ...createValidVtxo(),
        metadata: createValidMetadata(),
        // Missing assetId
      };

      expect(() => {
        AssetVtxoSchema.parse(invalidAssetVtxo);
      }).toThrow();
    });

    it('should reject AssetVtxo with empty assetId', () => {
      const invalidAssetVtxo = {
        ...createValidVtxo(),
        assetId: '',
        metadata: createValidMetadata(),
      };

      expect(() => {
        AssetVtxoSchema.parse(invalidAssetVtxo);
      }).toThrow();
    });

    it('should reject AssetVtxo with missing metadata', () => {
      const invalidAssetVtxo = {
        ...createValidVtxo(),
        assetId: 'koi_abc123',
        // Missing metadata
      };

      expect(() => {
        AssetVtxoSchema.parse(invalidAssetVtxo);
      }).toThrow();
    });

    it('should reject AssetVtxo with invalid metadata (missing dna)', () => {
      const invalidAssetVtxo = {
        ...createValidVtxo(),
        assetId: 'koi_abc123',
        metadata: {
          generation: 0,
          cooldownBlock: 100,
          lastFedBlock: 50,
          xp: 0,
          // Missing dna
        },
      };

      expect(() => {
        AssetVtxoSchema.parse(invalidAssetVtxo);
      }).toThrow();
    });

    it('should reject AssetVtxo with invalid metadata (negative generation)', () => {
      const invalidAssetVtxo = {
        ...createValidVtxo(),
        assetId: 'koi_abc123',
        metadata: {
          dna: asGenome('a'.repeat(64)),
          generation: -1, // Invalid
          cooldownBlock: 100,
          lastFedBlock: 50,
          xp: 0,
        },
      };

      expect(() => {
        AssetVtxoSchema.parse(invalidAssetVtxo);
      }).toThrow();
    });

    it('should reject AssetVtxo with invalid metadata (negative xp)', () => {
      const invalidAssetVtxo = {
        ...createValidVtxo(),
        assetId: 'koi_abc123',
        metadata: {
          dna: asGenome('a'.repeat(64)),
          generation: 0,
          cooldownBlock: 100,
          lastFedBlock: 50,
          xp: -1, // Invalid
        },
      };

      expect(() => {
        AssetVtxoSchema.parse(invalidAssetVtxo);
      }).toThrow();
    });

    it('should reject AssetVtxo with invalid base Vtxo fields', () => {
      const invalidAssetVtxo = {
        txid: '1'.repeat(63), // Too short
        vout: 0,
        amount: 1000,
        address:
          'bcrt1p123456789012345678901234567890123456789012345678901234567890',
        spent: false,
        assetId: 'koi_abc123',
        metadata: createValidMetadata(),
      };

      expect(() => {
        AssetVtxoSchema.parse(invalidAssetVtxo);
      }).toThrow();
    });
  });

  describe('Polymorphism Check', () => {
    it('should be compatible with functions expecting Vtxo', () => {
      const assetVtxo: AssetVtxo = AssetVtxoSchema.parse({
        ...createValidVtxo(),
        assetId: 'koi_abc123',
        metadata: createValidMetadata(),
      });

      // Function that accepts Vtxo
      const processVtxo = (vtxo: Vtxo): Vtxo => {
        return vtxo;
      };

      // AssetVtxo should be assignable to Vtxo (structural typing)
      // TypeScript's structural typing allows this since AssetVtxo has all Vtxo properties
      const vtxo: Vtxo = {
        txid: assetVtxo.txid,
        vout: assetVtxo.vout,
        amount: assetVtxo.amount,
        address: assetVtxo.address,
        spent: assetVtxo.spent,
      };

      const result = processVtxo(vtxo);

      expect(result.txid).toBe(assetVtxo.txid);
      expect(result.vout).toBe(assetVtxo.vout);
      expect(result.amount).toBe(assetVtxo.amount);
      expect(result.address).toBe(assetVtxo.address);
      expect(result.spent).toBe(assetVtxo.spent);
    });

    it('should have all Vtxo properties accessible', () => {
      const assetVtxo: AssetVtxo = AssetVtxoSchema.parse({
        ...createValidVtxo(),
        assetId: 'koi_abc123',
        metadata: createValidMetadata(),
      });

      // Verify all Vtxo properties are present
      expect(assetVtxo.txid).toBeDefined();
      expect(assetVtxo.vout).toBeDefined();
      expect(assetVtxo.amount).toBeDefined();
      expect(assetVtxo.address).toBeDefined();
      expect(assetVtxo.spent).toBeDefined();

      // Verify AssetVtxo-specific properties are present
      expect(assetVtxo.assetId).toBeDefined();
      expect(assetVtxo.metadata).toBeDefined();
    });

    it('should allow extracting Vtxo from AssetVtxo', () => {
      const assetVtxo: AssetVtxo = AssetVtxoSchema.parse({
        ...createValidVtxo(),
        assetId: 'koi_abc123',
        metadata: createValidMetadata(),
      });

      // Extract base Vtxo properties
      const baseVtxo: Vtxo = {
        txid: assetVtxo.txid,
        vout: assetVtxo.vout,
        amount: assetVtxo.amount,
        address: assetVtxo.address,
        spent: assetVtxo.spent,
      };

      // Verify it's a valid Vtxo structure
      expect(baseVtxo.txid).toBe(assetVtxo.txid);
      expect(baseVtxo.vout).toBe(assetVtxo.vout);
      expect(baseVtxo.amount).toBe(assetVtxo.amount);
      expect(baseVtxo.address).toBe(assetVtxo.address);
      expect(baseVtxo.spent).toBe(assetVtxo.spent);
    });
  });
});
