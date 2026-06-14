const mongodbService = require('../services/mongodbService');

const createProject = async (req, res) => {
  try {
    const { Name } = req.body;
    if (!Name) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    const project = await mongodbService.createProject(Name);
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllProjects = async (req, res) => {
  try {
    const projects = await mongodbService.getAllProjects();
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: error.message });
  }
};

const getImportCatalog = async (req, res) => {
  try {
    const catalog = await mongodbService.getAllProjectsImportCatalog();
    res.json(catalog);
  } catch (error) {
    console.error('Error fetching import catalog:', error);
    res.status(500).json({ error: error.message });
  }
};

const getProject = async (req, res) => {
  try {
    const { id } = req.params;
    const includeContent =
      req.query.includeContent === 'true' || req.query.includeContent === '1';
    const projectData = await mongodbService.readProjectComplete(id, { includeContent });
    res.json(projectData);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: error.message });
  }
};

const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const project = await mongodbService.updateProject(id, updates);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    await mongodbService.deleteProject(id);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createProject,
  getAllProjects,
  getImportCatalog,
  getProject,
  updateProject,
  deleteProject
};

