-- Backfill script to update existing imported portfolios
UPDATE groups 
SET type = 'SuperInvestor' 
WHERE description LIKE '%Imported from DataRoma%';

-- Optional: If we want to try to extract the code and rebuild the reference, it's tricky in pure SQL without the code stored separately.
-- However, existing imports might not have the code easily accessible in the description unless we parse it.
-- The user request only specified setting the type, so we will focus on that safely.
