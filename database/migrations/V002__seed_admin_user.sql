INSERT INTO users (id, email, password_hash, name, role, active)
VALUES (
    gen_random_uuid(),
    'admin@edgeai.local',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
    'Admin',
    'admin',
    true
)
ON CONFLICT (email) DO NOTHING;
