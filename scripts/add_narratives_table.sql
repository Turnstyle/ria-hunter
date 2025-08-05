-- Add the missing ria_narratives table

CREATE TABLE IF NOT EXISTS ria_narratives (
    narrative_pk SERIAL PRIMARY KEY,
    adviser_fk INTEGER REFERENCES advisers(adviser_pk) ON DELETE CASCADE,
    filing_fk INTEGER REFERENCES filings(filing_pk) ON DELETE CASCADE,
    narrative_type TEXT,  -- 'profile', 'brochure', 'crs', etc.
    narrative_text TEXT,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ria_narratives_adviser_fk ON ria_narratives(adviser_fk);
CREATE INDEX IF NOT EXISTS idx_ria_narratives_filing_fk ON ria_narratives(filing_fk);
CREATE INDEX IF NOT EXISTS idx_ria_narratives_type ON ria_narratives(narrative_type);