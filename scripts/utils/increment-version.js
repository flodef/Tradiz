// Script to increment the minor version in package.json
import fs from 'fs';
import path from 'path';

const packageJsonPath = path.join(process.cwd(), 'package.json');

try {
  // Read package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Parse current version
  const currentVersion = packageJson.version;
  const versionParts = currentVersion.split('.');
  
  // Increment minor version
  if (versionParts.length >= 2) {
    const majorVersion = versionParts[0];
    const minorVersion = parseInt(versionParts[1], 10) + 1;
    
    // Create new version string
    const newVersion = `${majorVersion}.${minorVersion}`;
    
    // Update package.json
    packageJson.version = newVersion;
    
    // Write updated package.json
    fs.writeFileSync(
      packageJsonPath, 
      JSON.stringify(packageJson, null, 2) + '\n', 
      'utf8'
    );
    
    console.log(`📦 Version bumped: ${currentVersion} → ${newVersion}`);
  } else {
    console.error('❌ Invalid version format in package.json');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error updating version:', error);
  process.exit(1);
}
