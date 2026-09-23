import express from "express";

export interface Cat {
    id: number;
    name: string;
    age: number;
    color: string;
}

const cats: Cat[] = [];
let nextId = 1;

const catsRouter = express.Router();

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
 *           example: Whiskers
 *         age:
 *           type: integer
 *           minimum: 0
 *           example: 3
 *         color:
 *           type: string
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
 *           example: Whiskers
 *         age:
 *           type: integer
 *           minimum: 0
 *           example: 3
 *         color:
 *           type: string
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
catsRouter.get("/", (req, res) => {
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
catsRouter.get("/:id", (req, res) => {
    const cat = cats.find((c) => c.id === Number(req.params.id));
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
 *         description: Required fields are missing
 */
catsRouter.post("/", (req, res) => {
    const { name, age, color } = req.body;
    if (!name || age === undefined || !color) {
        return res.status(400).json({ message: "name, age and color are required" });
    }
    const cat: Cat = { id: nextId++, name, age, color };
    cats.push(cat);
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
 *             $ref: '#/components/schemas/CatInput'
 *     responses:
 *       200:
 *         description: The updated cat
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cat'
 *       404:
 *         description: Cat not found
 */
catsRouter.put("/:id", (req, res) => {
    const cat = cats.find((c) => c.id === Number(req.params.id));
    if (!cat) {
        return res.status(404).json({ message: "Cat not found" });
    }
    const { name, age, color } = req.body;
    if (name !== undefined) cat.name = name;
    if (age !== undefined) cat.age = age;
    if (color !== undefined) cat.color = color;
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
catsRouter.delete("/:id", (req, res) => {
    const index = cats.findIndex((c) => c.id === Number(req.params.id));
    if (index === -1) {
        return res.status(404).json({ message: "Cat not found" });
    }
    cats.splice(index, 1);
    res.status(204).send();
});

export default catsRouter;