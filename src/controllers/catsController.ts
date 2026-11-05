import express from "express";
import { getCatModel } from "../models/cat";

const catsRouter = express.Router();
const maxInteger = 2147483647;

function isValidId(value: string): boolean {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 && id <= maxInteger;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validFields(body: Record<string, unknown>): boolean {
    return (body.name === undefined || (typeof body.name === "string" && body.name.length > 0))
        && (body.color === undefined || (typeof body.color === "string" && body.color.length > 0))
        && (body.age === undefined || (typeof body.age === "number" && Number.isInteger(body.age)
            && body.age >= 0 && body.age <= maxInteger));
}

/**
 * @openapi
 * components:
 *   schemas:
 *     Cat:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - age
 *         - color
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           minLength: 1
 *           example: Whiskers
 *         age:
 *           type: integer
 *           minimum: 0
 *           maximum: 2147483647
 *           example: 3
 *         color:
 *           type: string
 *           minLength: 1
 *           example: black
 *     CatInput:
 *       type: object
 *       required:
 *         - name
 *         - age
 *         - color
 *       properties:
 *         name:
 *           type: string
 *           minLength: 1
 *           example: Whiskers
 *         age:
 *           type: integer
 *           minimum: 0
 *           maximum: 2147483647
 *           example: 3
 *         color:
 *           type: string
 *           minLength: 1
 *           example: black
 */

/**
 * @openapi
 * /api/cats:
 *   get:
 *     summary: Get all cats
 *     tags: [Cats]
 *     responses:
 *       200:
 *         description: A list of cats
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Cat'
 */
catsRouter.get("/", async (req, res) => {
    const cats = await getCatModel().findAll({ order: [["id", "ASC"]] });
    res.json(cats);
});

/**
 * @openapi
 * /api/cats/{id}:
 *   get:
 *     summary: Get a cat by ID
 *     tags: [Cats]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Cat ID
 *     responses:
 *       200:
 *         description: The requested cat
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cat'
 *       404:
 *         description: Cat not found
 */
catsRouter.get("/:id", async (req, res) => {
    const cat = isValidId(req.params.id) ? await getCatModel().findByPk(Number(req.params.id)) : null;
    if (!cat) {
        return res.status(404).json({ message: "Cat not found" });
    }
    res.json(cat);
});

/**
 * @openapi
 * /api/cats:
 *   post:
 *     summary: Create a cat
 *     tags: [Cats]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CatInput'
 *     responses:
 *       201:
 *         description: The created cat
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cat'
 *       400:
 *         description: Required fields are missing or invalid
 */
catsRouter.post("/", async (req, res) => {
    const body: unknown = req.body;
    if (!isRecord(body) || !body.name || body.age === undefined || !body.color) {
        return res.status(400).json({ message: "name, age and color are required" });
    }
    if (!validFields(body) || typeof body.name !== "string"
        || typeof body.age !== "number" || typeof body.color !== "string") {
        return res.status(400).json({ message: "Invalid cat fields" });
    }
    const cat = await getCatModel().create({ name: body.name, age: body.age, color: body.color });
    res.status(201).json(cat);
});

/**
 * @openapi
 * /api/cats/{id}:
 *   put:
 *     summary: Update a cat
 *     tags: [Cats]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Cat ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *               age:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 2147483647
 *               color:
 *                 type: string
 *                 minLength: 1
 *     responses:
 *       200:
 *         description: The updated cat
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cat'
 *       400:
 *         description: Invalid cat fields
 *       404:
 *         description: Cat not found
 */
catsRouter.put("/:id", async (req, res) => {
    const cat = isValidId(req.params.id) ? await getCatModel().findByPk(Number(req.params.id)) : null;
    if (!cat) {
        return res.status(404).json({ message: "Cat not found" });
    }
    const body: unknown = req.body;
    if (!isRecord(body) || !validFields(body)) {
        return res.status(400).json({ message: "Invalid cat fields" });
    }
    if (typeof body.name === "string") cat.name = body.name;
    if (typeof body.age === "number") cat.age = body.age;
    if (typeof body.color === "string") cat.color = body.color;
    await cat.save();
    res.json(cat);
});

/**
 * @openapi
 * /api/cats/{id}:
 *   delete:
 *     summary: Delete a cat
 *     tags: [Cats]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Cat ID
 *     responses:
 *       204:
 *         description: Cat deleted successfully
 *       404:
 *         description: Cat not found
 */
catsRouter.delete("/:id", async (req, res) => {
    const deleted = isValidId(req.params.id) ? await getCatModel().destroy({ where: { id: Number(req.params.id) } }) : 0;
    if (deleted === 0) {
        return res.status(404).json({ message: "Cat not found" });
    }
    res.status(204).send();
});

export default catsRouter;