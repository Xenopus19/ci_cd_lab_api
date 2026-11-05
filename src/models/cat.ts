import { DataTypes, Model } from "sequelize";
import type { CreationOptional, InferAttributes, InferCreationAttributes } from "sequelize";
import { getSequelize } from "../database/sequelize";

export class Cat extends Model<InferAttributes<Cat>, InferCreationAttributes<Cat>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare age: number;
  declare color: string;
}

export function getCatModel(): typeof Cat {
  if (!Cat.sequelize) {
    Cat.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.TEXT, allowNull: false },
        age: { type: DataTypes.INTEGER, allowNull: false },
        color: { type: DataTypes.TEXT, allowNull: false },
      },
      { sequelize: getSequelize(), tableName: "cats", timestamps: false },
    );
  }
  return Cat;
}
