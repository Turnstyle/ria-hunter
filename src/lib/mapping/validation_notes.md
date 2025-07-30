# Validation Notes for RIA Hunter Data Processing

## Field Validation Rules

### CIK (Central Index Key)
- **Format**: Exactly 10 digits
- **Pattern**: `^\d{10}$`
- **Example**: `0001234567`
- **Notes**: Leading zeros are significant and must be preserved

### CRD (Central Registration Depository) Number
- **Format**: 1 to 8 digits
- **Pattern**: `^\d{1,8}$`
- **Example**: `12345678`
- **Notes**: No leading zeros required, but should be stored as string to preserve format

### Phone Numbers
- **Input Format**: Various formats accepted (e.g., "(555) 123-4567", "555-123-4567", "5551234567")
- **Output Format**: `+1XXXXXXXXXX` (E.164 format for US numbers)
- **Validation**: Must contain exactly 10 digits after cleaning
- **Notes**: All non-digit characters are stripped, then formatted with +1 prefix

### Email Addresses
- **Pattern**: Standard email validation
- **Notes**: Should be normalized to lowercase for consistency

### ZIP Codes
- **Format**: 5 digits or 5+4 format (XXXXX-XXXX)
- **Pattern**: `^\d{5}(-\d{4})?$`
- **Notes**: Extended ZIP+4 format is optional

### State Codes
- **Format**: 2-letter US state abbreviations
- **Notes**: Should be converted to uppercase for consistency

### URLs/Websites
- **Format**: Must include protocol (http:// or https://)
- **Normalization**: Add https:// if protocol is missing
- **Validation**: Basic URL format validation

### Assets Under Management (AUM)
- **Format**: Numeric values, may include currency symbols and commas
- **Normalization**: Strip currency symbols and commas, convert to numeric
- **Storage**: Store as decimal/numeric type in database

### Dates
- **Input Format**: Various formats (MM/DD/YYYY, YYYY-MM-DD, etc.)
- **Output Format**: ISO 8601 (YYYY-MM-DD)
- **Validation**: Must be valid dates, reasonable range checks

## Data Quality Rules

### Required Fields
- `firm_name`: Must not be empty
- `crd_number`: Must be present and valid
- `address`: Must not be empty for primary business address
- `city`: Must not be empty
- `state`: Must be valid US state code
- `zip_code`: Must be present and valid

### Optional Fields
- `sec_number`: May be empty for state-registered advisers
- `website`: Optional but should be validated if present
- `phone`: Recommended but may be missing
- `email`: Optional but should be validated if present

## Business Logic Notes

### Duplicate Detection
- Primary key: CRD Number
- Secondary matching: Firm name + address combination
- Handle name variations (Inc., LLC, etc.)

### Data Freshness
- Form ADV filings are updated annually or when material changes occur
- Check filing dates to ensure most recent data is used

### Error Handling
- Invalid data should be logged but not cause pipeline failure
- Implement fallback values for non-critical fields
- Flag records with validation errors for manual review 