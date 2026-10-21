# TDK Example Tiltfile
# Minimal Tiltfile demonstrating TDK PSR model

# Must be set before the extension loads: discovery/constants.star reads it to
# find this project's spec.master (services/identity, services/appointment)
# instead of falling back to the beauty-crm monorepo's default scan roots.
os.environ['TDK_PROJECT_ROOT'] = config.main_dir

# Load TDK extension
v1alpha1.extension_repo(name='tdk-cli', url='https://github.com/flisk-sh/tdk-cli')
v1alpha1.extension(name='tdk-cli', repo_name='tdk-cli', repo_path='')

# Load TDK utilities
load('ext://tdk-cli', 'Utils', 'Manifest', 'Config')

print("🚀 TDK Example Project")
print("   Project → Stack → Resource")
print("")

# Default to all services if no args
config.define_string_list("to-run", args=True)
cfg = config.parse()

# Let TDK handle service discovery and registration
# Services are discovered from service.json files automatically
