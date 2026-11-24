CREATE TABLE IF NOT EXISTS payroll_components (
 month TEXT NOT NULL,
 user_id TEXT NOT NULL,
 details_json TEXT NOT NULL CHECK(json_valid(details_json) AND json_type(details_json)='object' AND length(details_json)<=4096),
 PRIMARY KEY(month,user_id),
 FOREIGN KEY(month,user_id) REFERENCES payroll_inputs(month,user_id) ON DELETE CASCADE
);
