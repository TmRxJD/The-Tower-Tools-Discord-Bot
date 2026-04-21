import type { CommandModule } from '../core/command-types';
import { askCommand } from './ask';
import { eightBallCommand } from './8ball';
import { pingCommand } from './ping';
import { serverCommand } from './server';
import { creatorCommand } from './creator';
import { userCommand } from './user';
import { defineCommand } from './define';
import { defineMessageCommand } from './define-message';
import { acronymCommand } from './acronym';
import { acronymsCommand } from './acronyms';
import { earningsCommand } from './earnings';
import { meowCommand } from './meow';
import { toolsCommand } from './tools';
import { chartCommand } from './chart';
import { cphCommand } from './cph';
import { moduleCommand } from './module';
import { labCommand } from './lab';
import { thornsCommand } from './thorns';
import { workshopCommand } from './workshop';
import { stoneCommand } from './stone';
import { botsCommand } from './bots';
import { analyticsCommand } from './analytics';
import { checklistCommand } from './checklist';
import { remindCommand } from './remind';
import { reloadCommand } from './reload';
import { settingsCommand } from './settings';
import { shardSplitterCommand } from './shard-splitter';
import { guardianCommand } from './guardian';
import { battleConditionsCommand } from './battle-conditions';

export const commandModules: CommandModule[] = [
  askCommand,
  eightBallCommand,
  pingCommand,
  serverCommand,
  creatorCommand,
  userCommand,
  defineCommand,
  defineMessageCommand,
  acronymCommand,
  acronymsCommand,
  earningsCommand,
  meowCommand,
  toolsCommand,
  chartCommand,
  cphCommand,
  moduleCommand,
  labCommand,
  thornsCommand,
  workshopCommand,
  stoneCommand,
  botsCommand,
  analyticsCommand,
  checklistCommand,
  remindCommand,
  reloadCommand,
  settingsCommand,
  shardSplitterCommand,
  guardianCommand,
  battleConditionsCommand,
];
