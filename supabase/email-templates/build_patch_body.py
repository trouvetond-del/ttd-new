import json

with open('supabase/email-templates/magic-link.html') as f:
    html = f.read()

payload = {
    'mailer_subjects_magic_link': 'Accédez à votre espace TrouveTonDemenageur',
    'mailer_templates_magic_link_content': html,
}

with open('/tmp/auth_config_patch.json', 'w') as f:
    json.dump(payload, f)
