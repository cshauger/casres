/**
 * GitHub-based JSON storage
 * Stores data in the repo as subscribers.json
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = 'cshauger';
const REPO_NAME = 'casres';
const FILE_PATH = 'data/subscribers.json';

export async function getSubscribers() {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (response.status === 404) {
      // File doesn't exist yet
      return [];
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading from GitHub:', error);
    return [];
  }
}

export async function saveSubscribers(subscribers) {
  try {
    // Get current file SHA (needed for updates)
    let sha = null;
    const checkResponse = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (checkResponse.ok) {
      const existing = await checkResponse.json();
      sha = existing.sha;
    }

    // Update or create file
    const content = Buffer.from(JSON.stringify(subscribers, null, 2)).toString('base64');
    
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update subscribers (${subscribers.length} total)`,
          content,
          sha
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    return true;
  } catch (error) {
    console.error('Error saving to GitHub:', error);
    throw error;
  }
}
