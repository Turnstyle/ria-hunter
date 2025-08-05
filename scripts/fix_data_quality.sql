-- Data Quality Fix SQL for RIA Hunter
-- Addresses AUM units and duplicate CRD issues

-- 1. Create helper function to identify duplicate firms
CREATE OR REPLACE FUNCTION get_duplicate_firms()
RETURNS TABLE(legal_name TEXT, crd_count BIGINT, crd_numbers BIGINT[]) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rp.legal_name, 
        COUNT(rp.crd_number) as crd_count,
        ARRAY_AGG(rp.crd_number ORDER BY rp.aum DESC NULLS LAST) as crd_numbers
    FROM ria_profiles rp
    WHERE rp.legal_name IS NOT NULL 
    AND rp.legal_name != ''
    GROUP BY rp.legal_name
    HAVING COUNT(rp.crd_number) > 1
    ORDER BY COUNT(rp.crd_number) DESC;
END;
$$ LANGUAGE plpgsql;

-- 2. Check current AUM values for Edward Jones
SELECT legal_name, crd_number, aum, city, state 
FROM ria_profiles 
WHERE legal_name ILIKE '%edward%jones%' 
ORDER BY aum DESC NULLS LAST;

-- 3. Check if AUM values need fixing (if Edward Jones < $100M, they're in wrong units)
DO $$
DECLARE
    edward_jones_aum NUMERIC;
    records_updated INTEGER;
BEGIN
    -- Get Edward Jones AUM
    SELECT MAX(aum) INTO edward_jones_aum 
    FROM ria_profiles 
    WHERE legal_name ILIKE '%edward%jones%';
    
    RAISE NOTICE 'Edward Jones current max AUM: %', edward_jones_aum;
    
    -- If less than 100 million, multiply by 1000 (assuming values are in thousands)
    IF edward_jones_aum IS NOT NULL AND edward_jones_aum < 100000000 THEN
        RAISE NOTICE 'AUM values appear to be in thousands. Multiplying by 1000...';
        
        UPDATE ria_profiles 
        SET aum = aum * 1000 
        WHERE aum IS NOT NULL AND aum > 0;
        
        GET DIAGNOSTICS records_updated = ROW_COUNT;
        RAISE NOTICE 'Updated AUM for % records', records_updated;
        
        -- Show Edward Jones new AUM
        SELECT MAX(aum) INTO edward_jones_aum 
        FROM ria_profiles 
        WHERE legal_name ILIKE '%edward%jones%';
        
        RAISE NOTICE 'Edward Jones new max AUM: %', edward_jones_aum;
    ELSE
        RAISE NOTICE 'AUM values appear to be in correct units (or Edward Jones not found)';
    END IF;
END;
$$;

-- 4. Show duplicate firms before cleanup
SELECT * FROM get_duplicate_firms() LIMIT 10;

-- 5. Fix duplicates by keeping the record with highest AUM per firm
DO $$
DECLARE
    firm_record RECORD;
    primary_crd BIGINT;
    duplicate_crd BIGINT;
    duplicates_removed INTEGER := 0;
BEGIN
    -- Process each firm with duplicates
    FOR firm_record IN SELECT * FROM get_duplicate_firms() LOOP
        -- Get the CRD with highest AUM (first in the array)
        primary_crd := firm_record.crd_numbers[1];
        
        RAISE NOTICE 'Processing firm: % (keeping CRD %)', firm_record.legal_name, primary_crd;
        
        -- Update narratives to point to primary CRD
        FOR i IN 2..array_length(firm_record.crd_numbers, 1) LOOP
            duplicate_crd := firm_record.crd_numbers[i];
            
            -- Move narratives from duplicate to primary
            UPDATE narratives 
            SET crd_number = primary_crd 
            WHERE crd_number = duplicate_crd;
            
            -- Delete the duplicate profile
            DELETE FROM ria_profiles 
            WHERE crd_number = duplicate_crd;
            
            duplicates_removed := duplicates_removed + 1;
            RAISE NOTICE '  - Removed duplicate CRD %', duplicate_crd;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Total duplicate records removed: %', duplicates_removed;
END;
$$;

-- 6. Verify fixes
SELECT 'After cleanup - Duplicate firms:' as status;
SELECT COUNT(*) as duplicate_firms_remaining FROM get_duplicate_firms();

SELECT 'After cleanup - Edward Jones AUM:' as status;
SELECT legal_name, crd_number, aum 
FROM ria_profiles 
WHERE legal_name ILIKE '%edward%jones%' 
ORDER BY aum DESC NULLS LAST
LIMIT 3;

SELECT 'Top 5 RIAs by AUM:' as status;
SELECT legal_name, crd_number, aum, city, state 
FROM ria_profiles 
WHERE aum IS NOT NULL 
ORDER BY aum DESC 
LIMIT 5;

-- 7. Clean up function
DROP FUNCTION IF EXISTS get_duplicate_firms();