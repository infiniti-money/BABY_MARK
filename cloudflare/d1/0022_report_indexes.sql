-- Optional read-performance indexes. Review/apply separately; never run at request time.
-- No changes to permissions, attendance, payroll, retention or service plans.
CREATE INDEX IF NOT EXISTS assignment_report_date ON assignments(work_date,starts_at,id);
-- Match the report's approved > pending > rejected precedence exactly.
CREATE INDEX IF NOT EXISTS request_report_choice ON workforce_requests(
 assignment_id,CASE state WHEN 'APPROVED' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,created_at DESC,id DESC
);
