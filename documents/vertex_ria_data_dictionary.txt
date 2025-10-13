# RIA Hunter Data Dictionary for Vertex AI Search

This document summarizes the structured datasets exported from Supabase for ingestion into Vertex AI Search. It complements the `master_knowledge_base_09-19-25.txt` file by describing field meanings, relationships, and suggested usage patterns. All tables share the primary key `crd_number` unless noted otherwise.

## `ria_profiles`
- **crd_number**: Primary identifier for the adviser (matches SEC Form ADV CRD).
- **legal_name**: Firm’s legal name as reported in Form ADV.
- **city**: Headquarters city (title-cased, blanks set to null).
- **state**: Two-letter USPS state code or null for international entries.
- **aum**: Total assets under management (numeric, in USD). May be null if unreported.
- **form_adv_date**: Date of the most recent Form ADV filing.
- **private_fund_count** / **private_fund_aum**: Aggregate count and gross asset value of private funds managed (derived from Schedule D 7.B(1)).
- **last_private_fund_analysis**: Date the private fund metrics were last updated.
- **phone** / **fax**: Contact numbers in E.164 format (`+1XXXXXXXXXX`) when available.
- **website**: Firm website with explicit `https://` prefix when provided.
- **cik**: SEC Central Index Key, if mapped.

## `narratives`
- **crd_number**: Links to `ria_profiles`.
- **narrative**: Long-form narrative from Form ADV Part 2 (Item 4/Brochure). Use for detailed descriptions of services, strategies, and disclosures.
- **embedding**: Original pgvector (768-d). Re-embed with Vertex; you can drop this field during export if using Vertex-native embeddings.

## `ria_private_funds`
- **id**: Surrogate key for the fund record.
- **crd_number**: Owning adviser.
- **filing_id** / **reference_id**: Form ADV Schedule D identifiers (may be null).
- **fund_name / fund_id**: Reported fund name and SEC identifier if provided.
- **fund_type / fund_type_other**: Primary strategy (e.g., “Private Equity Fund”, “Venture Capital Fund”). Use both fields to capture custom labels.
- **gross_asset_value** / **min_investment**: Fund size and investor minimums (numeric, USD).
- **is_3c1 / is_3c7**: Indicates relevant Investment Company Act exemptions.
- **is_master / is_feeder / is_fund_of_funds**: Structural flags.
- **master_fund_name / master_fund_id**: Link to master funds when this fund is a feeder.
- **invested_self_related / invested_securities**: Fund holdings details when disclosed.
- **prime_brokers / custodians / administrator**: Service providers (free text).
- **percent_assets_valued**: Portion of assets valued at cost vs. fair value (numeric).
- **marketing / annual_audit / gaap / fs_distributed / unqualified_opinion**: Compliance and reporting flags.
- **owners**: Reported number of beneficial owners (integer).
- **created_at**: Timestamp of ingestion.

## `ria_fund_marketers`
- **id**: Surrogate key.
- **crd_number**: Adviser linked to the marketing relationship.
- **filing_id / fund_reference_id**: Schedule D linkage fields.
- **related_person**: `true` if the marketer is an affiliated person.
- **marketer_name / marketer_sec_number / marketer_crd_number**: Identifiers for the placement agent.
- **city / state / country**: Marketer location.
- **website**: Marketer website when disclosed.
- **created_at**: Timestamp of ingestion.

## `control_persons`
- **id**: Surrogate key.
- **crd_number**: Adviser associated with the person.
- **person_name**: Executive or direct owner name (Schedule A/B).
- **title**: Reported title/role (e.g., “CEO”, “Managing Partner”).
- **created_at**: Timestamp of ingestion.

## Materialized View Export (`mv_firm_activity`)
- **crd_number**, **legal_name**, **city**, **state**: Adviser identifiers from `ria_profiles`.
- **vc_fund_count**: Count of venture/private funds attributed to the firm.
- **vc_total_aum**: Aggregate gross asset value of those funds.
- **activity_score**: Weighted score `0.6 * vc_fund_count + 0.4 * (vc_total_aum / 1,000,000)`; higher indicates more venture activity.
- **executives**: JSON array of `{ "name": "...", "title": "..." }` derived from `control_persons`.

### Suggested Vertex Usage
- Ingest each table/export as a separate JSONL/CSV source. Include `crd_number` to join results inside your application if needed.
- Use `mv_firm_activity` for answering ranking questions (“top venture-active RIAs in Missouri”) without recomputing scores at query time.
- Use `ria_private_funds` + `ria_fund_marketers` to answer detailed fund and placement-agent queries.
- Use `narratives` and the knowledge-base text store for long-form context; cite `ria_profiles` fields (phone, website, location) for structured answers.

Keep this document in sync whenever the Supabase schema evolves so Vertex AI Search has an up-to-date field guide.
